import * as commander from 'commander';
import { existsSync } from 'fs';
import { parseCommaSeparatedOption } from '../utils.js';
import { DEFAULT_MATCH_COLUMNS } from '../csv.js';
import { runCombineStats, CombineStatsOptions } from '../combine.js';
import VERSION from '../version.js';

const { Option } = commander;

function validate(options: CombineStatsOptions) {
  if (!options.files || options.files.length < 2) {
    throw new Error(
      'At least 2 files must be provided (--files file1.csv file2.csv ...)',
    );
  }

  for (const filePath of options.files) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
  }

  if (!options.matchColumns || options.matchColumns.length === 0) {
    throw new Error(
      'At least one match column must be specified (--match-columns)',
    );
  }
}

export function createCombineStatsCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('combine-stats')
    .description(
      'Combines multiple CSV stat files (e.g., repo-stats, project-stats) into a single CSV by joining on matching columns',
    )
    .version(VERSION)
    .addOption(
      new Option(
        '--files <paths...>',
        'Two or more CSV files to combine (space-separated)',
      ).makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--match-columns <columns>',
        'Comma-separated column names used to match rows across files',
      )
        .env('MATCH_COLUMNS')
        .default(DEFAULT_MATCH_COLUMNS.join(','))
        .argParser(parseCommaSeparatedOption),
    )
    .addOption(
      new Option(
        '--output-file <name>',
        'Name for the combined output CSV file (default: auto-generated with timestamp)',
      ).env('COMBINE_OUTPUT_FILE'),
    )
    .addOption(
      new Option('--output-dir <dir>', 'Output directory for the combined file')
        .env('OUTPUT_DIR')
        .default('output'),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(async (options: CombineStatsOptions) => {
      console.log('Version:', VERSION);

      // Handle match-columns default: when not provided by user, Commander
      // passes the string default which needs to be converted to array
      if (typeof options.matchColumns === 'string') {
        options.matchColumns = parseCommaSeparatedOption(
          options.matchColumns as string,
        );
      }

      console.log('Validating options...');
      validate(options);

      console.log('Starting combine-stats...');
      await runCombineStats(options);
      console.log('Combine-stats completed.');
    });

  return command;
}

const combineStatsCommand = createCombineStatsCommand();
export default combineStatsCommand;
