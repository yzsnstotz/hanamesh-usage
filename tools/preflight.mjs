import {checkToolchain,preflight} from '@hanamesh/devkit';
import {toolchainConfig,root,validateHostPreflight} from '../devkit.config.mjs';
process.chdir(root);
const actual=checkToolchain(toolchainConfig);
await preflight({root,validate:()=>validateHostPreflight(actual)});
