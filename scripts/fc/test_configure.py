import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import zipfile
import configure as c

class PackageConfigTests(unittest.TestCase):
    def test_rejects_missing_settings_together_without_values(self):
        with self.assertRaisesRegex(ValueError, 'FC_ACCOUNT_ID.*FC_REGION.*FC_PREFIX'):
            c.check_settings({}, {'functions': [{'name':'frontend'}]})

    def test_requires_separate_content_origin(self):
        with self.assertRaisesRegex(ValueError, 'separate'):
            c.runtime_config({'PUBLIC_ORIGIN':'https://app.example.com', 'CONTENT_ORIGIN':'https://app.example.com'}, False)

    def test_frontend_strips_fc_attachment_except_growth_downloads(self):
        import re
        template = (Path(__file__).resolve().parents[2] / 'deploy/fc/frontend.conf.template').read_text(encoding='utf-8')
        blocks = re.findall(r'location[^{]+\{[^}]+\}', template)
        def block_for(prefix):
            matches = [b for b in blocks if b.split('{', 1)[0].strip().endswith(prefix)]
            self.assertTrue(matches, prefix)
            return matches[0]
        for prefix in ('^~ /admin/assets/', '^~ /admin', '^~ /games/', '^~ /game-shell/', '^~ /api/', '^~ /users/'):
            self.assertIn('proxy_hide_header Content-Disposition', block_for(prefix))
        admin_assets = block_for('^~ /admin/assets/')
        self.assertIn('proxy_cache admin_assets', admin_assets)
        self.assertNotIn('proxy_hide_header Content-Disposition', block_for('^~ /api/v1/growth'))

    def test_frontend_requires_private_upstream_and_runtime_token(self):
        env = dict(PUBLIC_ORIGIN='https://app.example.com', CONTENT_ORIGIN='https://content.example.com', FC_API_URL='https://api.example.com', FC_INTERNAL_TOKEN='a'*64)
        runtime = c.runtime_config(env, False)
        self.assertEqual(runtime['services']['frontend']['API_UPSTREAM'], env['FC_API_URL'])
        self.assertEqual(set(runtime['services']['frontend']), {'API_UPSTREAM', 'GAMEVALLIES_FC_INTERNAL_TOKEN'})
        logged = c.runtime_config({**env, 'FC_LOG_PROJECT':'logs', 'FC_LOG_STORE':'runtime'}, False)
        self.assertEqual(logged['logConfig'], {'project':'logs', 'logstore':'runtime'})
        with self.assertRaisesRegex(ValueError, 'FC_LOG_STORE'):
            c.runtime_config({**env, 'FC_LOG_PROJECT':'logs'}, False)
        for upstream in (env['PUBLIC_ORIGIN'], env['CONTENT_ORIGIN']):
            with self.assertRaisesRegex(ValueError, 'backend function'):
                c.runtime_config({**env, 'FC_API_URL': upstream}, False)
        with self.assertRaisesRegex(ValueError, 'public site domain'):
            c.runtime_config({**env, 'FC_API_URL': 'https://www.zlspace.ai'}, False)
        for token in ('', 'invalid'):
            with self.assertRaises(ValueError): c.runtime_config({**env, 'FC_INTERNAL_TOKEN': token}, False)

    def test_zip_bootstrap_digest_and_path_guards(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'frontend.zip'
            def write(mode=0o755, extra=None):
                with zipfile.ZipFile(path,'w') as archive:
                    info=zipfile.ZipInfo('bootstrap'); info.external_attr=(0o100000|mode)<<16
                    archive.writestr(info,'#!/bin/sh\nexit 0\n')
                    if extra: archive.writestr(extra,'bad')
            write()
            result=c.package_index(folder,{'functions':[{'name':'frontend'}]},{'RELEASE_SHA':'a'*40})
            self.assertEqual(len(result['frontend']['sha256']),64)
            self.assertIn('/releases/'+'a'*40+'/', result['frontend']['object'])
            write(mode=0o644)
            with self.assertRaisesRegex(ValueError,'executable'): c.package_index(folder,{'functions':[{'name':'frontend'}]},{'RELEASE_SHA':'a'*40})
            for entry in ('../outside', '.env.production', '/absolute'):
                write(extra=entry)
                with self.assertRaisesRegex(ValueError,'Unsafe'): c.package_index(folder,{'functions':[{'name':'frontend'}]},{'RELEASE_SHA':'a'*40})

    def test_upload_rejects_changed_package_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'frontend.zip').write_bytes(b'changed')
            env=dict(ALIBABA_CLOUD_ACCESS_KEY_ID='test',ALIBABA_CLOUD_ACCESS_KEY_SECRET='test',FC_REGION='cn-shenzhen',ALIYUN_OSS_BUCKET='test-bucket')
            with patch('oss2.Bucket') as bucket:
                with self.assertRaisesRegex(ValueError,'changed'):
                    c.upload(folder, {'frontend':{'sha256':'0'*64,'object':'test'}},env)
                bucket.return_value.put_object_from_file.assert_not_called()

if __name__=='__main__': unittest.main()
