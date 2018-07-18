import { captureURIs, doAPIRequest, createServer, genUserAndDb } from '../../../../../lib/util';
import { EncryptedInstance, StringifiedObjectId } from '../../../../../../app/database/db-types';
import { testParams, testInvalidCredentials } from '../../../../../lib/macros';
import { API_ERRS } from '../../../../../../app/api';
import speakeasy = require('speakeasy');
import mongo = require('mongodb');
import { test } from 'ava';

const uris = captureURIs(test);
testParams(test, uris, '/api/instance/2fa/verify', {
	instance_id: 'string',
	twofactor_token: 'string',
	pw_verification_token: 'string'
}, {}, {}, {});
test('fails if account has no 2FA setup', async t => {
	const config = await genUserAndDb(t, {
		account_twofactor_enabled: false,
		instance_twofactor_enabled: false,
		twofactor_token: null!
	});
	const server = await createServer(config);
	const { 
		http, 
		uri, 
		instance_id, 
	} = config;
	uris.push(uri);

	const response = JSON.parse(await doAPIRequest({ port: http }, '/api/instance/2fa/verify', {
		instance_id: instance_id.toHexString(),
		twofactor_token: 'sometoken',
		pw_verification_token: 'sometoken'
	}));

	server.kill();

	t.false(response.success, 'API call failed');
	if (response.success) return;
	t.is(response.ERR, API_ERRS.INVALID_CREDENTIALS, 'got invalid credentials error');
});
test('fails if an invalid 2FA token is passed', async t => {
	const twofactor = speakeasy.generateSecret();
	const config = await genUserAndDb(t, {
		account_twofactor_enabled: true,
		instance_twofactor_enabled: true,
		twofactor_token: twofactor.base32
	});
	const server = await createServer(config);
	const { 
		http, 
		uri, 
		instance_id, 
	} = config;
	uris.push(uri);

	const response = JSON.parse(await doAPIRequest({ port: http }, '/api/instance/2fa/verify', {
		instance_id: instance_id.toHexString(),
		twofactor_token: speakeasy.totp({
			secret: twofactor.base32,
			encoding: 'base32',
			time: Date.now() - (60 * 60)
		}),
		pw_verification_token: 'sometoken'
	}));

	server.kill();

	t.false(response.success, 'API call failed');
	if (response.success) return;
	t.is(response.ERR, API_ERRS.INVALID_CREDENTIALS, 'got invalid credentials error');
});
test('fails if an invalid password verification token is passed', async t => {
	const twofactor = speakeasy.generateSecret();
	const config = await genUserAndDb(t, {
		account_twofactor_enabled: true,
		instance_twofactor_enabled: true,
		twofactor_token: twofactor.base32
	});
	const server = await createServer(config);
	const { 
		http, 
		uri, 
		instance_id, 
	} = config;
	uris.push(uri);

	const response = JSON.parse(await doAPIRequest({ port: http }, '/api/instance/2fa/verify', {
		instance_id: instance_id.toHexString(),
		twofactor_token: speakeasy.totp({
			secret: twofactor.base32,
			encoding: 'base32'
		}),
		pw_verification_token: 'sometoken'
	}));

	server.kill();

	t.false(response.success, 'API call failed');
	if (response.success) return;
	t.is(response.ERR, API_ERRS.INVALID_CREDENTIALS, 'got invalid credentials error');
});
test('fails if instance id wrong', async t => {
	const twofactor = speakeasy.generateSecret();
	const config = await genUserAndDb(t, {
		account_twofactor_enabled: true,
		instance_twofactor_enabled: true,
		twofactor_token: twofactor.base32
	});
	const server = await createServer(config);
	const { http, uri } = config;
	uris.push(uri);

	await testInvalidCredentials(t, {
		route: '/api/instance/2fa/verify',
		port: http,
		encrypted: {},
		unencrypted: {
			instance_id: new mongo.ObjectId().toHexString() as StringifiedObjectId<EncryptedInstance>,
			twofactor_token: speakeasy.totp({
				secret: twofactor.base32,
				encoding: 'base32'
			}),
			pw_verification_token: 'sometoken'
		},
		server: server
	});
});