const parallel = require('mocha.parallel') as (name: string, fn: (this: Mocha.Context) => any) => void;
import { genRandomString } from '../../../../app/lib/util';
import { captureCreatedFiles } from '../../lib/util';
import { ProcRunner } from '../../lib/procrunner';
import * as fs from 'fs-extra'
import * as path from 'path'
import { assert } from 'chai';

export function genConfigTest() {
	parallel('GenConfig', () => {
		const files = captureCreatedFiles();
		it('print an error when no command is passed', async () => {
			const proc = new ProcRunner(['genconfig']);
			proc.expectWrite();
			proc.expectWrite('\terror: missing required argument `server/backup\'');
			proc.expectWrite();
			proc.expectExit(1);

			await proc.run();
			proc.check();
		}); 
		it('print an error when a non-command is used', async () => {
			const proc = new ProcRunner(['genconfig', 'noncommand']);
			proc.expectWrite('Given command has no config file, use "server" or "backup"');
			proc.expectExit(1);

			await proc.run();
			proc.check();
		});
		it('a server config can generated', async () => {
			const proc = new ProcRunner(['genconfig', 'server']);
			proc.expectWrite('Done!');
			proc.expectExit(0);

			await proc.run();
			proc.check();

			const cfgPath = path.join(__dirname, '../../../../cfg/server.json');
			files.push(cfgPath);
			assert.isTrue(fs.existsSync(cfgPath));
			const content = await fs.readFile(cfgPath, {
				encoding: 'utf8'
			});
			const expected = await fs.readFile(
				path.join(__dirname, '../../../../app/actions/server/config.json'), {
					encoding: 'utf8'
				});
			assert.strictEqual(content, expected,
				'config file matches expected');
		});
		it('a server config can generated to a custom path', async () => {
			const cfgPath = path.join(__dirname, `../../../../temp/${genRandomString(10)}/server.json`);
			const proc = new ProcRunner([
				'genconfig', 
				'server',
				'-o', cfgPath
			]);
			proc.expectWrite('Done!');
			proc.expectExit(0);

			await proc.run();
			proc.check();

			files.push(cfgPath);
			assert.isTrue(fs.existsSync(cfgPath));
			const content = await fs.readFile(cfgPath, {
				encoding: 'utf8'
			});
			const expected = await fs.readFile(
				path.join(__dirname, '../../../../app/actions/server/config.json'), {
					encoding: 'utf8'
				});
			assert.strictEqual(content, expected,
				'config file matches expected');
		});
		it('a backup config can generated', async () => {
			const proc = new ProcRunner(['genconfig', 'backup']);
			proc.expectWrite('Done!');
			proc.expectExit(0);

			await proc.run();
			proc.check();

			const cfgPath = path.join(__dirname, '../../../../cfg/backup.json');
			files.push(cfgPath);
			assert.isTrue(fs.existsSync(cfgPath));
			const content = await fs.readFile(cfgPath, {
				encoding: 'utf8'
			});
			const expected = await fs.readFile(
				path.join(__dirname, '../../../../app/actions/backup/config.json'), {
					encoding: 'utf8'
				});
			assert.strictEqual(content, expected,
				'config file matches expected');
		});
		it('a backup config can generated to a custom path', async () => {
			const cfgPath = path.join(__dirname, `../../../../temp/${genRandomString(10)}/backup.json`);
			const proc = new ProcRunner([
				'genconfig', 
				'backup',
				'-o', cfgPath
			]);
			proc.expectWrite('Done!');
			proc.expectExit(0);

			await proc.run();
			proc.check();

			files.push(cfgPath);
			assert.isTrue(fs.existsSync(cfgPath));
			const content = await fs.readFile(cfgPath, {
				encoding: 'utf8'
			});
			const expected = await fs.readFile(
				path.join(__dirname, '../../../../app/actions/backup/config.json'), {
					encoding: 'utf8'
				});
			assert.strictEqual(content, expected,
				'config file matches expected');
		});
	});
}