#!/usr/bin/env node

const https = require('https');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');

// Default configuration
const defaultConfig = {
    colors: true,
    dateFormat: 'local', // 'local' or 'iso'
    detailedView: true,
    eventsPerPage: 30,
    outputDir: './github-activity-logs'
};

// ANSI color codes
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

// Event type colors and icons
const eventSettings = {
    PushEvent: { color: colors.green, icon: '📝' },
    CreateEvent: { color: colors.cyan, icon: '✨' },
    IssuesEvent: { color: colors.yellow, icon: '🐛' },
    PullRequestEvent: { color: colors.magenta, icon: '🔄' },
    WatchEvent: { color: colors.blue, icon: '⭐' },
    ForkEvent: { color: colors.cyan, icon: '🔱' },
    DeleteEvent: { color: colors.red, icon: '🗑️' },
    ReleaseEvent: { color: colors.green, icon: '📦' },
    CommentEvent: { color: colors.yellow, icon: '💬' },
    default: { color: colors.reset, icon: '🔧' }
};

// Format date based on configuration
const formatDate = (dateString, format) => {
    const date = new Date(dateString);
    return format === 'iso' ? date.toISOString() : date.toLocaleString();
};

// Format the event with extended details
const formatEvent = (event, config) => {
    const { type, repo, payload, created_at } = event;
    const repoName = repo.name;
    const timestamp = formatDate(created_at, config.dateFormat);
    const settings = eventSettings[type] || eventSettings.default;
    
    const colorize = (text, color) => config.colors ? `${color}${text}${colors.reset}` : text;
    const timeStr = colorize(`[${timestamp}]`, colors.bright);

    let details = '';
    
    if (config.detailedView) {
        switch (type) {
            case 'PushEvent': {
                const commits = payload.commits || [];
                details = commits.map(c => 
                    `\n    - ${c.sha.slice(0, 7)} ${c.message.split('\n')[0]}`
                ).join('');
                break;
            }
            case 'IssuesEvent': {
                const { action, issue } = payload;
                details = `\n    Title: ${issue.title}\n    Labels: ${(issue.labels || []).map(l => l.name).join(', ') || 'none'}\n    URL: ${issue.html_url}`;
                break;
            }
            case 'PullRequestEvent': {
                const { action, pull_request } = payload;
                details = `\n    Title: ${pull_request.title}\n    Changes: +${pull_request.additions || 0} -${pull_request.deletions || 0}\n    URL: ${pull_request.html_url}`;
                break;
            }
            case 'ReleaseEvent': {
                const { release } = payload;
                details = `\n    Tag: ${release.tag_name}\n    Name: ${release.name}\n    URL: ${release.html_url}`;
                break;
            }
        }
    }

    return colorize(`${timeStr} ${settings.icon} ${formatEventTitle(event)} ${details}`, settings.color);
};

// Format the main event title
const formatEventTitle = (event) => {
    const { type, repo, payload } = event;
    
    switch (type) {
        case 'PushEvent':
            return `Pushed ${payload.commits?.length || 0} commit(s) to ${repo.name}`;
        case 'CreateEvent':
            return `Created ${payload.ref_type}${payload.ref ? ` '${payload.ref}'` : ''} in ${repo.name}`;
        case 'IssuesEvent':
            return `${capitalize(payload.action)} issue #${payload.issue?.number} in ${repo.name}`;
        case 'PullRequestEvent':
            return `${capitalize(payload.action)} pull request #${payload.pull_request?.number} in ${repo.name}`;
        case 'WatchEvent':
            return `Starred ${repo.name}`;
        case 'ForkEvent':
            return `Forked ${repo.name} to ${payload.forkee?.full_name}`;
        case 'DeleteEvent':
            return `Deleted ${payload.ref_type} '${payload.ref}' from ${repo.name}`;
        case 'ReleaseEvent':
            return `${capitalize(payload.action)} release ${payload.release?.tag_name} in ${repo.name}`;
        default:
            return `${type} on ${repo.name}`;
    }
};

const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';

// Fetch GitHub activity with advanced options
const fetchGitHubActivity = async (username, page = 1, perPage = 30) => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: `/users/${username}/events?page=${page}&per_page=${perPage}`,
            headers: {
                'User-Agent': 'GitHub-Activity-CLI/2.0',
                'Accept': 'application/vnd.github.v3+json'
            }
        };

        https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try {
                        const remainingRequests = res.headers['x-ratelimit-remaining'];
                        if (remainingRequests && parseInt(remainingRequests) < 10) {
                            console.warn(`Warning: ${remainingRequests} API requests remaining`);
                        }
                        resolve(JSON.parse(data));
                    } catch (error) {
                        reject(new Error('Failed to parse GitHub API response'));
                    }
                } else if (res.statusCode === 404) {
                    reject(new Error(`User '${username}' not found`));
                } else if (res.statusCode === 403) {
                    reject(new Error('API rate limit exceeded. Please try again later.'));
                } else {
                    reject(new Error(`HTTP Error: ${res.statusCode}`));
                }
            });
        }).on('error', error => reject(new Error(`Failed to connect: ${error.message}`)));
    });
};

// Save events to file
const saveToFile = async (events, username, config) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${username}-activity-${timestamp}.json`;
    const filepath = path.join(config.outputDir, filename);

    try {
        await fs.mkdir(config.outputDir, { recursive: true });
        await fs.writeFile(filepath, JSON.stringify(events, null, 2));
        console.log(`\nActivity saved to: ${filepath}`);
    } catch (error) {
        throw new Error(`Failed to save file: ${error.message}`);
    }
};

// Filter events based on criteria
const filterEvents = (events, criteria) => {
    return events.filter(event => {
        if (criteria.type && event.type !== criteria.type) return false;
        if (criteria.repo && !event.repo.name.includes(criteria.repo)) return false;
        if (criteria.dateFrom && new Date(event.created_at) < new Date(criteria.dateFrom)) return false;
        if (criteria.dateTo && new Date(event.created_at) > new Date(criteria.dateTo)) return false;
        return true;
    });
};

// Interactive menu for filtering and navigation
const showMenu = async (events) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = `
${colors.bright}Options:${colors.reset}
1. Show next page
2. Filter events
3. Show all events
4. Save to file
5. Configure display
6. Exit

Select an option (1-6): `;

    const answer = await new Promise(resolve => rl.question(question, resolve));
    rl.close();
    return answer.trim();
};

// Configure display settings
const configureDisplay = async (config) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\nCurrent configuration:');
    Object.entries(config).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
    });

    const questions = {
        colors: 'Enable colors? (true/false): ',
        dateFormat: 'Date format (local/iso): ',
        detailedView: 'Show detailed view? (true/false): ',
        eventsPerPage: 'Events per page (10-100): '
    };

    for (const [key, question] of Object.entries(questions)) {
        const answer = await new Promise(resolve => rl.question(question, resolve));
        if (answer.trim()) {
            if (key === 'eventsPerPage') {
                config[key] = Math.min(100, Math.max(10, parseInt(answer)));
            } else if (typeof config[key] === 'boolean') {
                config[key] = answer.toLowerCase() === 'true';
            } else {
                config[key] = answer;
            }
        }
    }

    rl.close();
    return config;
};

// Filter menu
const showFilterMenu = async () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('\nFilter options:');
    console.log('1. By event type');
    console.log('2. By repository');
    console.log('3. By date range');
    console.log('4. Clear filters');

    const answer = await new Promise(resolve => 
        rl.question('Select filter option (1-4): ', resolve)
    );
    rl.close();
    return answer.trim();
};

// Modified fetch function to be more testable
const getUserActivity = async (username) => {
    try {
        const events = await fetchGitHubActivity(username);
        return {
            username,
            repos: events.reduce((acc, event) => {
                const repo = event.repo.name;
                if (!acc[repo]) {
                    acc[repo] = [];
                }
                acc[repo].push(event);
                return acc;
            }, {})
        };
    } catch (error) {
        if (error.message.includes('not found')) {
            return null;
        }
        throw error;
    }
};

// Main function
const main = async () => {
    const username = process.argv[2];

    if (!username) {
        console.log('Usage: github-activity <username>');
        console.log('Example: github-activity kamranahmedse');
        process.exit(1);
    }

    let currentPage = 1;
    let currentEvents = [];
    let config = { ...defaultConfig };
    let filterCriteria = {};

    try {
        console.log(`${colors.bright}Fetching activity for GitHub user: ${username}${colors.reset}`);
        
        while (true) {
            if (currentEvents.length === 0) {
                currentEvents = await fetchGitHubActivity(username, currentPage, config.eventsPerPage);
            }

            const filteredEvents = filterEvents(currentEvents, filterCriteria);
            filteredEvents.forEach(event => {
                console.log(formatEvent(event, config));
            });
            
            const choice = await showMenu(filteredEvents);
            
            switch (choice) {
                case '1':  // Next page
                    currentPage++;
                    currentEvents = await fetchGitHubActivity(username, currentPage, config.eventsPerPage);
                    break;
                
                case '2':  // Filter events
                    const filterChoice = await showFilterMenu();
                    switch (filterChoice) {
                        case '1':  // By event type
                            const types = [...new Set(currentEvents.map(e => e.type))];
                            types.forEach((type, i) => console.log(`${i + 1}. ${type}`));
                            const typeIdx = await new Promise(resolve => {
                                const rl = readline.createInterface({
                                    input: process.stdin,
                                    output: process.stdout
                                });
                                rl.question('Select event type: ', answer => {
                                    rl.close();
                                    resolve(answer.trim());
                                });
                            });
                            filterCriteria.type = types[parseInt(typeIdx) - 1];
                            break;
                        
                        case '2':  // By repository
                            const repoName = await new Promise(resolve => {
                                const rl = readline.createInterface({
                                    input: process.stdin,
                                    output: process.stdout
                                });
                                rl.question('Enter repository name (partial match): ', answer => {
                                    rl.close();
                                    resolve(answer.trim());
                                });
                            });
                            filterCriteria.repo = repoName;
                            break;
                        
                        case '3':  // By date range
                            const dates = await new Promise(resolve => {
                                const rl = readline.createInterface({
                                    input: process.stdin,
                                    output: process.stdout
                                });
                                rl.question('Enter date range (YYYY-MM-DD YYYY-MM-DD): ', answer => {
                                    rl.close();
                                    resolve(answer.trim().split(' '));
                                });
                            });
                            if (dates.length === 2) {
                                [filterCriteria.dateFrom, filterCriteria.dateTo] = dates;
                            }
                            break;
                        
                        case '4':  // Clear filters
                            filterCriteria = {};
                            break;
                    }
                    break;
                
                case '3':  // Show all events
                    filterCriteria = {};
                    break;
                
                case '4':  // Save to file
                    await saveToFile(currentEvents, username, config);
                    break;
                
                case '5':  // Configure display
                    config = await configureDisplay(config);
                    break;
                
                case '6':  // Exit
                    console.log('Goodbye!');
                    process.exit(0);
                    
                default:
                    console.log('Invalid option. Please try again.');
            }
        }
    } catch (error) {
        console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
        process.exit(1);
    }
};

// Export necessary functions for testing
module.exports = {
    getUserActivity,
    fetchGitHubActivity
};

// Only run main if this is the main module
if (require.main === module) {
    main();
}