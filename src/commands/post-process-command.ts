import * as commander from 'commander';
import { existsSync } from 'fs';
import { PostProcessOptions } from '../types.js';
import { runPostProcess } from '../post-process.js';
import VERSION from '../version.js';

const { Option } = commander;

function validate(options: PostProcessOptions) {
  if (!options.input) {
    throw new Error('Input CSV file is required (--input <file>)');
  }

  if (!existsSync(options.input)) {
    throw new Error(`Input CSV file not found: ${options.input}`);
  }

  if (!options.rulesFile) {
    throw new Error('Rules file is required (--rules-file <file>)');
  }

  if (!existsSync(options.rulesFile)) {
    throw new Error(`Rules file not found: ${options.rulesFile}`);
  }
}

export function createPostProcessCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('post-process')
    .description(
      'Transforms CSV data using configurable rules for pattern matching, value replacement, and indicator column generation',
    )
    .version(VERSION)
    .addOption(
      new Option('--input <file>', 'Path to the input CSV file to process')
        .env('POST_PROCESS_INPUT')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--rules-file <file>',
        'Path to the JSON rules configuration file',
      )
        .env('POST_PROCESS_RULES_FILE')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--output-file-name <name>',
        'Name for the output CSV file (default: auto-generated with timestamp)',
      ).env('POST_PROCESS_OUTPUT_FILE'),
    )
    .addOption(
      new Option(
        '--output-dir <dir>',
        'Output directory for the processed file',
      )
        .env('OUTPUT_DIR')
        .default('output'),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(async (options: PostProcessOptions) => {
      console.log('Version:', VERSION);

      console.log('Validating options...');
      validate(options);

      console.log('Starting post-process...');
      await runPostProcess(options);
      console.log('Post-process completed.');
    });

  return command;
}

const postProcessCommand = createPostProcessCommand();
export default postProcessCommand;
