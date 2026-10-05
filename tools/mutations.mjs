import {runMutations} from '@hanamesh/devkit';
import {mutationConfig,validateMutationEvidence,evidenceDir} from '../devkit.config.mjs';
await runMutations(mutationConfig);
validateMutationEvidence(evidenceDir);
