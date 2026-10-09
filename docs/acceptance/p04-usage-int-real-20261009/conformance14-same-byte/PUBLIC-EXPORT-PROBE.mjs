import {readFileSync} from 'node:fs';
const specifier='@hanamesh/server-usage/conformance';
const resolved=import.meta.resolve(specifier);
const suite=await import(specifier);
const packageJSON=new URL('../../package.json',resolved);
const pkg=JSON.parse(readFileSync(packageJSON,'utf8'));
if(pkg.version!=='0.2.0-rc.14'||typeof suite.checkConsumer!=='function')throw new Error('NORMAL_EXPORT_MISMATCH');
console.log(JSON.stringify({scope:'normal installed public export resolution/import only; vectors not rerun',specifier,resolved,packageVersion:pkg.version,packageLicense:pkg.license,packageExport:pkg.exports['./conformance'],suiteContract:suite.CONTRACT,checkConsumerType:typeof suite.checkConsumer,runHttpSuiteType:typeof suite.runHttpSuite,invokedChecks:0,HTTP:0,GUI:0}));
