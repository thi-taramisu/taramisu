"""Run with: python3 -m unittest discover -s iam/branding -v"""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from generate import generate, ROOT, THEMES, TEMPLATE, OUTPUT


class BrandingTests(unittest.TestCase):
    def test_shared_colour_change_reaches_both_modes(self):
        theme = THEMES['neutral'].read_text().replace('--primary: #262626;', '--primary: #7c3aed;')
        theme = theme.replace('--primary: #e5e5e5;', '--primary: #c4b5fd;')
        result = generate({name: path.read_text() for name, path in THEMES.items()} | {'neutral': theme}, TEMPLATE.read_text())
        self.assertIn('--taramisu-primary: light-dark(#7c3aed, #c4b5fd);', result)
        self.assertIn('background: var(--taramisu-primary);', result)
        self.assertIn('--taramisu-radius: 0.625rem;', result)

    def test_unsupported_palette_fails_instead_of_silently_drifting(self):
        for source in (
            THEMES['neutral'].read_text().replace('.dark {', '.other {'),
            THEMES['neutral'].read_text().replace('#262626', 'var(--another-token)'),
        ):
            with self.assertRaises(ValueError):
                generate({name: path.read_text() for name, path in THEMES.items()} | {'neutral': source}, TEMPLATE.read_text())

    def test_all_palettes_include_their_colours_and_inherit_radius(self):
        result = generate({name: path.read_text() for name, path in THEMES.items()}, TEMPLATE.read_text())
        self.assertIn('html[data-color-scheme="ocean"] ak-flow-executor', result)
        self.assertIn('html[data-color-scheme="iris"] ak-flow-executor', result)
        self.assertIn('--taramisu-primary: light-dark(#1d4ed8, #93c5fd);', result)
        self.assertEqual(result.count('--taramisu-radius: 0.625rem;'), 3)
        self.assertNotIn('@@THEME@@', result)

    def test_palette_light_override_also_applies_in_dark_mode(self):
        themes = {name: path.read_text() for name, path in THEMES.items()}
        themes['ocean'] = themes['ocean'].replace('--background:', '--radius: 0.75rem;\n  --background:', 1)
        result = generate(themes, TEMPLATE.read_text())
        self.assertEqual(result.count('--taramisu-radius: 0.75rem;'), 1)
        self.assertEqual(result.count('--taramisu-radius: 0.625rem;'), 2)

    def test_check_detects_stale_output_without_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in (*THEMES.values(), TEMPLATE, OUTPUT, Path(__file__).with_name('generate.py')):
                relative = source.relative_to(ROOT)
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(source.read_text())
            output = root / 'iam/blueprints/branding.yaml'
            output.write_text('stale')
            script = root / 'iam/branding/generate.py'
            result = subprocess.run([sys.executable, str(script), '--check'], capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(output.read_text(), 'stale')
            subprocess.run([sys.executable, str(script)], check=True, capture_output=True)
            subprocess.run([sys.executable, str(script), '--check'], check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
