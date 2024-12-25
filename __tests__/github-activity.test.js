const { getUserActivity } = require('../github-activity');

jest.mock('https', () => ({
    get: jest.fn((options, callback) => {
        const mockResponse = {
            statusCode: options.path.includes('nonexistentuser') ? 404 : 200,
            on: jest.fn((event, cb) => {
                if (event === 'data') {
                    cb(JSON.stringify([{
                        repo: {
                            name: 'test-repo'
                        },
                        type: 'PushEvent'
                    }]));
                }
                if (event === 'end') {
                    cb();
                }
            })
        };
        callback(mockResponse);
        return { on: jest.fn() };
    })
}));

describe('GitHub Activity', () => {
    it('should return activity data for a user', async () => {
        const userActivity = await getUserActivity('username');
        expect(userActivity).toBeDefined();
        expect(userActivity).toHaveProperty('repos');
        expect(userActivity.repos).toHaveProperty('test-repo');
    });

    it('should handle non-existent users', async () => {
        const userActivity = await getUserActivity('nonexistentuser');
        expect(userActivity).toBeNull();
    });
});