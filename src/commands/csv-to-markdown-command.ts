import * as commander from 'commander';
import { existsSync } from 'fs';
import { runCsvToMarkdown } from '../csv-to-markdown.js';
import { CsvToMarkdownFormat, CsvToMarkdownOptions } from '../types.js';
import VERSION from '../version.js';

const { Option } = commander;

function validate(options: CsvToMarkdownOptions) {
  if (!options.input) {
    throw new Error('Input CSV file is required (--input <file>)');
  }

  if (!existsSync(options.input)) {
    throw new Error(`Input CSV file not found: ${options.input}`);
  }
}

export function createCsvToMarkdownCommand(): commander.Command {
  const command = new commander.Command();

  command
    .name('csv-to-markdown')
    .description(
      'Converts a CSV file into markdown using either a standard table or a vertical metric/value layout',
    )
    .version(VERSION)
    .addOption(
      new Option('--input <file>', 'Path to the input CSV file')
        .env('CSV_TO_MARKDOWN_INPUT')
        .makeOptionMandatory(true),
    )
    .addOption(
      new Option(
        '--format <format>',
        'Markdown output format: table for standard tables, vertical for single-row metric/value output',
      )
        .choices(['table', 'vertical'])
        .default('table')
        .env('CSV_TO_MARKDOWN_FORMAT'),
    )
    .addOption(
      new Option(
        '--title <title>',
        'Optional section title to prepend as a markdown heading',
      ).env('CSV_TO_MARKDOWN_TITLE'),
    )
    .addOption(
      new Option(
        '--output-file-name <name>',
        'Name for the output markdown file (default: auto-generated with timestamp)',
      ).env('CSV_TO_MARKDOWN_OUTPUT_FILE'),
    )
    .addOption(
      new Option('--output-dir <dir>', 'Output directory for the markdown file')
        .env('OUTPUT_DIR')
        .default('output'),
    )
    .addOption(
      new Option('-v, --verbose', 'Enable verbose logging').env('VERBOSE'),
    )
    .action(
      async (
        options: CsvToMarkdownOptions & { format: CsvToMarkdownFormat },
      ) => {
        console.log('Version:', VERSION);

        console.log('Validating options...');
        validate(options);

        console.log('Starting csv-to-markdown...');
        await runCsvToMarkdown(options);
        console.log('Csv-to-markdown completed.');
      },
    );

  return command;
}

const csvToMarkdownCommand = createCsvToMarkdownCommand();
export default csvToMarkdownCommand;
