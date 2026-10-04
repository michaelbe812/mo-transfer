import { formatFiles, type Tree } from '@nx/devkit';
import { generateTestingLib } from '../shared/slice';
import { sliceNames } from '../shared/slice-templates';
import { assertSliceExists } from '../shared/workspace';

export interface TestingGeneratorSchema {
  domain: string;
  /** example fixtures/handlers/scenarios instead of the scaffold (default false) */
  examples?: boolean;
  skipFormat?: boolean;
}

/**
 * libs/<domain>/testing alone — for slices that have none yet. Default: the scaffold (typed, empty
 * handlers/scenarios on the generated baseline of the slice's clients); `--examples`: example data.
 */
export async function testingGenerator(tree: Tree, options: TestingGeneratorSchema): Promise<void> {
  assertSliceExists(tree, options.domain);
  generateTestingLib(tree, sliceNames(options.domain), { examples: options.examples });
  if (!options.skipFormat) await formatFiles(tree);
}

export default testingGenerator;
