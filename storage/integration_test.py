import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import tempfile
import urllib.error
import urllib.request
import uuid

SOURCE = Path(__file__).resolve().parents[1]
PROJECT = 'storage-test-' + uuid.uuid4().hex[:10]
ENV = {k: v for k, v in os.environ.items() if not k.startswith(('S3_', 'COMPOSE_'))}
ENV['COMPOSE_PROJECT_NAME'] = PROJECT
ENV['S3_DEV_PORT'] = '0'
CLIENT = '''
import boto3, os, socket
from botocore.config import Config
from botocore import UNSIGNED
from botocore.exceptions import ClientError
from bootstrap import client
c, root = client('S3'), client()
bucket, key, body = os.environ['S3_BUCKET'], 'acceptance/document', b'synthetic architecture document\\x00\\xff'
def denied(call, **kwargs):
    try:
        call(**kwargs)
    except ClientError as e:
        assert e.response['ResponseMetadata']['HTTPStatusCode'] == 403, e
    else:
        raise AssertionError('Unauthorized operation succeeded')
'''


def run(*args, check=True):
    result = subprocess.run(args, env=ENV, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if check and result.returncode:
        raise RuntimeError(f'{args[0]} failed:\n{result.stdout}')
    return result.stdout


with tempfile.TemporaryDirectory(prefix=PROJECT) as directory:
    work = Path(directory)
    for component in ('deploy', 'storage'):
        shutil.copytree(SOURCE / component, work / component, ignore=shutil.ignore_patterns('.env', '.env.??????'))
    (work / 'iam').mkdir()
    shutil.copy(SOURCE / 'iam/.env.example', work / 'iam/.env.example')
    envfile = work / 'storage/.env'
    base = ['docker', 'compose', '--env-file', str(work / 'iam/.env'), '--env-file', str(envfile), '-f', str(work / 'deploy/compose.yaml')]
    files = []
    probe_networks = [PROJECT + '_edge', PROJECT + '_proxy']
    restore_volume = PROJECT + '-restored_data'

    def compose(*args, check=True):
        return run(*base, *files, *args, check=check)

    def execute(code, *options):
        return compose('run', '--rm', '--no-deps', *options, '--entrypoint', 'python', 'storage-init', '-c', CLIENT + code)

    def start():
        compose('up', '-d', '--wait', '--wait-timeout', '180', 'storage')
        compose('run', '--rm', '--no-deps', 'storage-init')

    def inspect_storage():
        return json.loads(run('docker', 'inspect', compose('ps', '-q', 'storage').strip()))[0]

    try:
        run('sh', str(work / 'deploy/dev.sh'), '--init')
        compose('build', 'storage-config', 'storage-init')
        image = PROJECT + '-storage-init'
        start()
        compose('run', '--rm', '--no-deps', 'storage-init')
        assert not any(inspect_storage()['NetworkSettings']['Ports'].values())
        error = compose('run', '--rm', '--no-deps', '-e', 'S3_SECRET_KEY=', 'storage-config', check=False)
        assert 'S3_SECRET_KEY is required' in error
        execute('''
c.put_object(Bucket=bucket, Key=key, Body=body)
assert c.get_object(Bucket=bucket, Key=key)['Body'].read() == body
assert key in [x['Key'] for x in c.list_objects_v2(Bucket=bucket)['Contents']]
c.put_object(Bucket=bucket, Key='delete-me', Body=body)
c.delete_object(Bucket=bucket, Key='delete-me')
assert 'delete-me' not in [x['Key'] for x in c.list_objects_v2(Bucket=bucket)['Contents']]
other = 'other-application'
root.create_bucket(Bucket=other)
root.put_object(Bucket=other, Key=key, Body=body)
for operation, kwargs in [(c.get_object, {'Key':key}), (c.put_object, {'Key':key, 'Body':body}),
                          (c.delete_object, {'Key':key}), (c.list_objects_v2, {})]:
    denied(operation, Bucket=other, **kwargs)
denied(c.create_bucket, Bucket='unauthorized-bucket')
anonymous = boto3.client('s3', endpoint_url='http://storage:8333', config=Config(signature_version=UNSIGNED))
denied(anonymous.get_object, Bucket=bucket, Key=key)
denied(anonymous.list_objects_v2, Bucket=bucket)
for port in (9333, 19333, 8888, 18888, 8080, 18080, 8181, 9101):
    try:
        with socket.create_connection(('storage', port), timeout=1):
            raise AssertionError(f'Internal listener exposed: {port}')
    except OSError:
        pass
root.delete_object(Bucket=other, Key=key)
root.delete_bucket(Bucket=other)
''')
        ip = next(iter(inspect_storage()['NetworkSettings']['Networks'].values()))['IPAddress']
        for network in probe_networks:
            run('docker', 'network', 'create', network)
            run('docker', 'run', '--rm', '--network', network, '--entrypoint', 'python', image, '-c', f'''
import socket
try:
    socket.getaddrinfo('storage', 8333)
except socket.gaierror:
    pass
else:
    raise AssertionError('Storage resolves on proxy network')
for port in (8333, 18333, 9333, 19333, 8888, 18888, 8080, 18080):
    try:
        with socket.create_connection(({ip!r}, port), timeout=1):
            raise AssertionError(f'Storage port {{port}} reachable from proxy network')
    except OSError:
        pass
''')
        print('PASS: bucket permissions, anonymous denial, private listeners and edge and proxy networks', flush=True)

        compose('stop', 'storage')
        old = dict(line.split('=', 1) for line in envfile.read_text().splitlines() if line.startswith('S3_'))
        oldfile = work / 'old.json'
        oldfile.write_text(json.dumps(old))
        oldfile.chmod(0o600)
        updated = envfile.read_text()
        for key in ('S3_ROOT_ACCESS_KEY', 'S3_ROOT_SECRET_KEY', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'):
            updated = updated.replace(f'{key}={old[key]}', f'{key}={secrets.token_hex(32)}')
        envfile.write_text(updated)
        start()
        execute('''
import json
assert c.get_object(Bucket=bucket, Key=key)['Body'].read() == body
old = json.load(open('/old.json'))
for prefix in ('S3', 'S3_ROOT'):
    previous = boto3.client('s3', endpoint_url='http://storage:8333', region_name='us-east-1',
        aws_access_key_id=old[prefix+'_ACCESS_KEY'], aws_secret_access_key=old[prefix+'_SECRET_KEY'])
    denied(previous.get_object, Bucket=bucket, Key=key)
''', '-v', str(oldfile) + ':/old.json:ro')
        print('PASS: stopped-service rotation preserves objects and rejects old keys', flush=True)

        compose('stop', 'storage')
        run('docker', 'run', '--rm', '--network', 'none', '-v', PROJECT + '-storage_data:/data:ro',
            '-v', str(work) + ':/backup', '--entrypoint', 'tar', image, 'czpf', '/backup/storage.tgz', '-C', '/data', '.')
        run('docker', 'volume', 'create', restore_volume)
        run('docker', 'run', '--rm', '--network', 'none', '-v', restore_volume + ':/data',
            '-v', str(work) + ':/backup:ro', '--entrypoint', 'tar', image, 'xzpf', '/backup/storage.tgz', '-C', '/data')
        compose('down')
        restore = work / 'restore.yaml'
        restore.write_text(f'volumes:\n  storage_data:\n    name: {restore_volume}\n')
        files = ['-f', str(restore)]
        start()
        execute("assert c.get_object(Bucket=bucket, Key=key)['Body'].read() == body")
        print('PASS: cold restore into a new volume preserves object content', flush=True)

        compose('down')
        files += ['-f', str(work / 'deploy/compose.storage-dev.yaml')]
        start()
        binding = inspect_storage()['NetworkSettings']['Ports']['8333/tcp'][0]
        assert binding['HostIp'] == '127.0.0.1'
        endpoint = 'http://127.0.0.1:' + binding['HostPort']
        try:
            urllib.request.urlopen(endpoint, timeout=5)
        except urllib.error.HTTPError as e:
            assert e.code == 403
        else:
            raise AssertionError('Anonymous host request was accepted')
        run('docker', 'run', '--rm', '--network', 'host', '--env-file', str(envfile), '--entrypoint', 'python', image, '-c', CLIENT + f'''
c = boto3.client('s3', endpoint_url={endpoint!r}, region_name='us-east-1',
    aws_access_key_id=os.environ['S3_ACCESS_KEY'], aws_secret_access_key=os.environ['S3_SECRET_KEY'])
c.put_object(Bucket=bucket, Key='host-upload', Body=body)
assert c.get_object(Bucket=bucket, Key='host-upload')['Body'].read() == body
''')
        print('PASS: real localhost binding, anonymous denial and signed host upload/download', flush=True)
    finally:
        if envfile.exists():
            compose('down', '-v', '--remove-orphans', check=False)
        for network in probe_networks:
            run('docker', 'network', 'rm', network, check=False)
        for volume in (PROJECT + '-storage_data', PROJECT + '-storage_config', restore_volume):
            run('docker', 'volume', 'rm', volume, check=False)
        for image_name in (PROJECT + '-storage-init', PROJECT + '-storage-config'):
            run('docker', 'image', 'rm', image_name, check=False)
