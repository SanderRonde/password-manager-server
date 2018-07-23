import { genTempDatabase, captureURIs, captureCreatedFiles } from '../../lib/util';
import { genRandomString } from '../../../app/lib/util';
import { ProcRunner } from '../../lib/procrunner';
import { genDBWithPW, clearDB, getDB, hasCreatedDBWithPW } from '../../lib/db';
import path = require('path');
import { test } from 'ava';
import fs = require('fs');

const uris = captureURIs(test);
const files = captureCreatedFiles(test);
test('print an error when no command is passed', async t => {
	const proc = new ProcRunner(t, ['backup']);
	proc.expectWrite();
	proc.expectWrite('\terror: missing required argument `load/googledrive/local\'');
	proc.expectWrite();
	proc.expectExit(1);

	await proc.run();
	proc.check();
}); 
test('print an error when a non-command is used', async t => {
	const proc = new ProcRunner(t, ['backup', 'noncommand']);
	proc.expectWrite('Invalid backup method, choose "load", "drive" or "local"');
	proc.expectExit(1);

	await proc.run();
	proc.check();
});
test('a backupped file can be used to restore', async t => {
	const dumpName = genRandomString(10);
	const dumpPath = path.join(__dirname, `../../../temp/mongodump${dumpName}.dump`);
	const uri = await genTempDatabase(t);
	uris.push(uri);
	const dbpw = await genDBWithPW(uri);
	await (async () => {
		files.push(dumpPath);
		const proc = new ProcRunner(t, [
			'backup',
			'local',
			'-d', uri,
			'-o', dumpPath
		]);
		proc.expectWrite('Dumping...');
		proc.expectWrite('Writing file...');
		proc.expectWrite('Done writing file');
		proc.expectExit(0);

		await proc.run();
		proc.check();

		const exists = await new Promise<boolean>((resolve) => {
			fs.exists(dumpPath, (exists) => {
				resolve(exists);
			});
		});
		t.true(exists, 'dump file exists');
	})();
	await (async () => {
		await clearDB(uri);

		const { db, done } = await getDB(uri);
		t.is((await db.collection('meta').find().toArray()).length, 0,
			'meta collection is empty');
		done();

		const proc = new ProcRunner(t, [
			'backup',
			'load',
			'-i', dumpPath,
			'-d', uri
		]);
		proc.expectWrite('Reading file...');
		proc.expectWrite('Restoring...');
		proc.expectWrite('Done!');
		proc.expectExit(0);

		await proc.run();
		proc.check();

		//Check if the database was actually created
		t.true(await hasCreatedDBWithPW(dbpw, uri));
	})();
});