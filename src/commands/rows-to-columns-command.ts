import * as commander from 'commander';
import { existsSync } from 'fs';
import { RowsToColumnsOptions, runRowsToColumns } from '../rows-to-columns.js';
import VERSION from '../version.js';

const { Option } = commander;

function validate(options: RowsToColumnsOptions) {
  if (!options.baseCsvFile) {
    throw new Error('Base CSV file is required (--base-csv-file <file>)');
  }

  if (!existsSync(options.baseCsvFile)) {
    throw new Error(`Base CSV file not found: ${options.baseCsvFile}`);
  }

  if (!options.additionalCsvFile) {
    throw new Error(
      'Additional CSV file is required (--additional-csv-file <file>)',
    );
  }

  if (!existsSync(options.additionalCsvFile)) {
    throw new Error(
      `Additional CSV file not found: ${options.additionalCsvFile}`,
    );
  }

  if (!options.headerColumnKeys) {
    throw new Error(
      'Header column keys is required (--header-column-keys <column>)',
    );
  }

  if (!options.headerColumnValues) {
    throw new Error(
      'Header column values is required (--header-column-values <column>)',
    );
  }

  if (!options.baseCsvColumns || options.baseCsvColumns.length === 0) {
    throw new Error(
      'Base CSV columns are required (--base-csv-columns <columns>)',
    );
  }

  if (
    !options.additionalCsvColumns ||
    options.additionalCsvColumns.length === 0
  ) {
    throw new Error(
      'Additional CSV columns are required (--additional-csv-columns <columns>)',
    );
  }

  if (options.baseCsvColumns.length !== options.additionalCsvColumns.length) {
    throw new Error(
      `Base CSV columns (${options.baseCsvColumns.length}) and additional CSV columns (${options.additionalCsvColumns.length}) must have the same number of entries`,
    );
  }
}

export function createRowsToColumnsCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('rows-to-columns')
    .description(
      'Converts rows from an additional CSV into new columns in a base CSV by matching rows and pivoting values. Designed for combining repository statistics with migration audit data.',
    )
    .version(VERSION)
    .addOption(
      new Option('--base-csv-file <file>', 'Path to the base CSV file')
        .env('BASE_CSV_FILE')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--additional-csv-file <file>',
        'Path to the additional CSV file',
      )
        .env('ADDITIONAL_CSV_FILE')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--header-column-keys <column>',
        'Column in the additional CSV to use as new column headers',
      )
        .env('HEADER_COLUMN_KEYS')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--header-column-values <column>',
        'Column in the additional CSV to use as cell values',
      )
        .env('HEADER_COLUMN_VALUES')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--base-csv-columns <columns>',
        'Comma-separated column names in the base CSV used for matching rows',
      )
        .env('BASE_CSV_COLUMNS')
        .default(['Org_Name', 'Repo_Name'])
        .argParser((value: string) =>
          value
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
        ),
    )
    .addOption(
      new Option(
        '--additional-csv-columns <columns>',
        'Comma-separated column names in the additional CSV used for matching rows',
      )
        .env('ADDITIONAL_CSV_COLUMNS')
        .default(['owner', 'name'])
        .argParser((value: string) =>
          value
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
        ),
    )
    .addOption(
      new Option(
        '--output-file-name <name>',
        'Name for the output CSV file (default: auto-generated with timestamp)',
      ).env('ROWS_TO_COLUMNS_OUTPUT_FILE'),
    )
    .addOption(
      new Option('--output-dir <dir>', 'Output directory for the combined file')
        .env('OUTPUT_DIR')
        .default('output'),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(async (options: RowsToColumnsOptions) => {
      console.log('Version:', VERSION);

      console.log('Validating options...');
      validate(options);

      console.log('Starting rows-to-columns...');
      await runRowsToColumns(options);
      console.log('Rows-to-columns completed.');
    });

  return command;
}

const rowsToColumnsCommand = createRowsToColumnsCommand();
export default rowsToColumnsCommand;
