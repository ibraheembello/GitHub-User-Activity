# GitHub User Activity CLI

A command-line tool that fetches and displays GitHub user activity.

Project source: [roadmap.sh/projects/github-user-activity](https://roadmap.sh/projects/github-user-activity)

## Features

- Fetch recent GitHub activity for any user
- Display activity with colorful formatting and icons
- Filter activities by type, repository, or date
- Save activity logs to JSON files
- Configurable display options
- Pagination support

## Installation

```bash
npm install
```

## Usage

```bash
node github-activity.js <username>
```

Example:

```bash
node github-activity.js kamranahmedse
```

## Options

The interactive menu provides the following options:

1. Show next page
2. Filter events
3. Show all events
4. Save to file
5. Configure display
6. Exit

## Configuration

You can customize:

- Colors (enabled/disabled)
- Date format (local/ISO)
- Detailed view (enabled/disabled)
- Events per page (10-100)

## Requirements

- Node.js
- No external dependencies for core functionality
- Jest for testing (dev dependency)

## Testing

```bash
npm test
```

The README.md includes:

1. Project title and description
2. Original project URL from roadmap.sh
3. Key features and functionality
4. Installation and usage instructions
5. Available options and configuration
6. Requirements and testing info

Would you like me to add any other sections to the README?
