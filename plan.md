# Update template.yaml RestApi routes

## Notes

- User requested to update template.yaml's RestApi with the new routes found in the src folder.
- Existing template.yaml structure and resources have been reviewed.
- Route handler files in src (e.g., users.js, sync.js) are being analyzed to determine endpoints.
- Additional route files (protected/index.js, protected/openAIusage.js) have been reviewed for endpoint discovery.
- All new/changed routes in src have been identified and summarized.
- YAML syntax errors and lint issues (duplicate keys, incorrect types) in template.yaml have been identified and must be fixed for correctness.
- YAML syntax errors and lint issues have been fixed in template.yaml.
- All routes and structural corrections in template.yaml have been validated.
- User requested to update Lambda invoke permissions (InvokeByApi) for new routes.
- User needs to be able to test all routes with `sam local start-api`. This may require explicit Events configuration for each Lambda in template.yaml.
- Verifying and updating `env.json` for all Lambda function environment variables may be required for local route testing.

## Task List

- [x] Locate template.yaml file
- [x] Review current template.yaml structure and RestApi definition
- [x] List route handler files in src directory
- [x] Begin analyzing route handler files for endpoint details
- [x] Review protected/index.js and protected/openAIusage.js for route endpoints
- [x] Identify all new/changed routes in src
- [x] Update template.yaml RestApi DefinitionBody with new routes
- [x] Fix YAML syntax errors and lint issues in template.yaml
- [x] Validate updated template.yaml for correctness
- [x] Update Lambda invoke permissions (InvokeByApi) for new routes
- [ ] Ensure all routes are testable with sam local start-api (update Events for each Lambda)
- [ ] Verify and update env.json for all Lambda functions for local testing

## Current Goal

Ensure all routes are testable with sam local
