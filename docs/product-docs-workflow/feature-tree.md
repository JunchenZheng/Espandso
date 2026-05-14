# Product Documentation Feature Tree

This tree defines the user-facing product areas we want to document. It is intentionally written for non-technical users: no code modules, parser details, repository boundaries, or implementation terms.

Each leaf node should have at least one product screenshot and a short explanation in the final user documentation.

## 1. Get Oriented

- `orientation.main-workspace` - Main workspace
  - Show the collection pane, selected YAML file preview, toolbar actions, and snippet list.
- `orientation.collection-pane` - Collection pane
  - Show how files and folders are organized in the Espanso match directory.
- `orientation.config-preview` - Match file preview
  - Show the selected file name, path, snippet table, and available actions.

## 2. Manage Match Files

- `match-files.create-file` - Create a match file
  - Show the create file dialog from the collection pane.
- `match-files.create-folder` - Create a folder
  - Show the create folder dialog from the collection pane.
- `match-files.folder-detail` - Browse a folder
  - Show a folder detail page with child files and folders.
- `match-files.open-external` - Open a file outside Expandso
  - Show the file action menu or open-file affordance when available.

## 3. Manage Text Snippets

- `snippets.list` - Review snippets in a match file
  - Show triggers, snippet type, description, and replacement preview.
- `snippets.add-text` - Add a text snippet
  - Show the add snippet dialog with trigger, replacement text, and description.
- `snippets.edit-text` - Edit an existing text snippet
  - Show the edit snippet dialog for an existing row.
- `snippets.multiple-triggers` - Add trigger aliases
  - Show multiple trigger inputs in the snippet dialog.
- `snippets.insert-date` - Insert a date variable
  - Show the date insertion menu in a text snippet.
- `snippets.delete-one` - Delete one snippet
  - Show the delete confirmation for an existing snippet.
- `snippets.batch-delete` - Delete multiple snippets
  - Show batch delete selection mode and the confirmation dialog.

## 4. Add Richer Snippet Types

- `snippet-types.file` - Add a file-content snippet
  - Show the file snippet tab and selected external resource path.
- `snippet-types.image` - Add an image snippet
  - Show the image snippet tab and image path field.
- `snippet-types.form` - Add a form snippet
  - Show the form snippet editor with form layout and field controls.
- `snippet-types.rich-text` - Add Markdown or HTML content
  - Show rich text format choices when the setting is enabled.

## 5. Search And Navigate

- `search.open` - Open global search
  - Show the search dialog before typing a query.
- `search.results` - Search snippet results
  - Show search results across match files.
- `search.jump-to-result` - Jump from search to a snippet
  - Show the selected file with the matching snippet highlighted.

## 6. Review And Fix Issues

- `issues.conflicts-summary` - Review trigger conflicts
  - Show the conflicts dialog opened from the file toolbar.
- `issues.yaml-warnings` - Review YAML warnings
  - Show the warnings dialog with one or more warnings.
- `issues.file-warning` - Review warnings for one file
  - Show warnings filtered to the selected match file.

## 7. Import Existing Snippets

- `import.alfred.start` - Start Alfred import
  - Show the Alfred import dialog before selecting an archive.
- `import.alfred.review` - Review imported snippets
  - Show parsed Alfred snippets and target match file selection.

## 8. Configure Expandso

- `settings.general` - Open settings
  - Show language and Espanso directory settings.
- `settings.experimental` - Enable optional features
  - Show YAML warnings, rich text snippets, and conflict blocking settings.
- `settings.logs` - View Espanso logs
  - Show the logs dialog.
- `settings.about` - View app information
  - Show the about dialog and open source library list.

## Recommended First Screenshot Set

The first pass should focus on the smallest set that explains the product clearly:

1. `orientation.main-workspace`
2. `match-files.create-file`
3. `snippets.add-text`
4. `snippets.edit-text`
5. `snippets.batch-delete`
6. `search.results`
7. `issues.conflicts-summary`
8. `settings.general`

This gives enough coverage to write a usable non-technical guide before documenting every advanced snippet type.
