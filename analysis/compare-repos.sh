# check if gh cli extension repo-stats-plus is installed, if not, give error and exit

# setup variables - use one password cli op to set 
# SOURCE_ACCESS_TOKEN=# pull from op
# SOURCE_API_URL=https://api.github.com
# SOURCE_ORG=department-of-veterans-affairs

# TARGET_ACCESS_TOKEN=# pull from op
# TARGET_API_URL=https://va.ghe.com/api/v3
# TARGET_ORG=software

# write out log statements with each step and give details to know what is happening, and if any errors occur, log them to a file

# step 1 get the repos to process
#   read the migration-audit.csv file 
#   find any records where migration_status is in-progress
#   get the repo_name as well as the source_org and target_org 
#   have a list of repos to process, with source and target orgs

# step 2 iterate through the list of repos to process
#   for each repo, get the source org and target org
 
# step 3 for each repo, get the stats from source
# check if source_org matches the SOURCE_ORG variable, if not, give a warning but set the SOURCE_ORG temporarily to the source_org from the migration-audit.csv file for this repo
# # stats from source
# gh repo-stats-plus repo-stats \
#   --org-name $SOURCE_ORG \
#   --base-url $SOURCE_API_URL \
#   --output-dir output/source

# step 4 for each repo, get the stats from target
# check if target_org matches the TARGET_ORG variable, if not, give a warning but set the TARGET_ORG temporarily to the target_org from the migration-audit.csv file for this repo
# # stats from target 
# gh repo-stats-plus repo-stats \
#   --org-name $TARGET_ORG \
#   --base-url $TARGET_API_URL \
#   --output-dir output/target

# step 5 compare the stats from source and target
# # diff the two 
# gh repo-stats-plus compare-stats \
#   --source-file output/source/source-org-all_repos-<ts>_ts.csv \
#   --target-file output/target/target-org-all_repos-<ts>_ts.csv \
#   --output-dir output \
#   --output-file migration-diff.csv \
#   --fail-on-blocking

# step 6 track a file that has repos processed and their status from the compare-stats
#   the status will be matched, missing_in_target, or extra_in_target
#  create a file per status so that all repos with the same status are grouped together

# step 7 loop and iterate the next repo in the list of repos to process