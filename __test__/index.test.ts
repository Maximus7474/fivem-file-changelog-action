import { run } from '../src/index';
import * as core from '@actions/core';
import * as github from '@actions/github';

import { CONTEXT_HEAD_SHA, CONTEXT_OWNER, CONTEXT_REPO, MOCK_BASE_SHA, MOCK_TAG_NAME, mockComparisonData, mockTagResponse } from './mockdata';
import { getConfig } from '../src/config';

// Mock the core module functions used in the action
jest.mock('@actions/core', () => ({
  getInput: jest.fn(),
  setFailed: jest.fn(),
  info: jest.fn(),
}));

// Mock the github module context and getOctokit
jest.mock('@actions/github', () => ({
  context: {
    repo: {
      owner: CONTEXT_OWNER,
      repo: CONTEXT_REPO,
    },
    sha: CONTEXT_HEAD_SHA,
  },
  getOctokit: jest.fn(),
}));

// Helper function to set up Octokit mocks
const setupOctokitMocks = (
  tagResponse: any[] = mockTagResponse,
  comparisonResponse: any = mockComparisonData,
  tagError: Error | null = null,
  compareError: Error | null = null,
) => {
  // Mock the API calls
  const listTags = jest.fn();
  if (tagError) {
    listTags.mockRejectedValue(tagError);
  } else {
    listTags.mockResolvedValue({ data: tagResponse });
  }

  const compareCommits = jest.fn();
  if (compareError) {
    compareCommits.mockRejectedValue(compareError);
  } else {
    compareCommits.mockResolvedValue({ data: comparisonResponse });
  }


  const mockOctokit = {
    rest: {
      repos: {
        listTags,
        compareCommits,
      },
    },
  };

  (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
  return mockOctokit.rest.repos;
};

describe('run', () => {
  beforeEach(() => {
    // Clear all mock function calls before each test
    jest.clearAllMocks();

    (core.getInput as jest.Mock).mockImplementation((name) => {
      if (name === 'github_token') return 'mock-token';
      else if (name === 'webhook' && process.env.DISCORD_WEBHOOK) return process.env.DISCORD_WEBHOOK;
      else if (name === 'changelog' && process.env.CHANGELOG_DIR) return process.env.CHANGELOG_DIR;
      else if (name === 'changelog_filename' && process.env.CHANGELOG_FILENAME) return process.env.CHANGELOG_FILENAME;
      return '';
    });

    (core.setFailed as jest.Mock).mockImplementation((message) => {
      console.error('[CORE MOCK] (action failed)', message);
    });
  });

  it('should initialize properly', async () => {
    const reposMock = setupOctokitMocks();

    await run();

    // 1. Check token and octokit initialization
    expect(core.getInput).toHaveBeenCalledWith('github_token', { required: true });
    expect(github.getOctokit).toHaveBeenCalledWith('mock-token');

    // 2. Check tag fetching
    expect(reposMock.listTags).toHaveBeenCalledWith({
      owner: CONTEXT_OWNER,
      repo: CONTEXT_REPO,
      per_page: 1,
    });

    // 3. Check commit comparison
    expect(reposMock.compareCommits).toHaveBeenCalledWith({
      owner: CONTEXT_OWNER,
      repo: CONTEXT_REPO,
      base: MOCK_BASE_SHA,
      head: CONTEXT_HEAD_SHA,
    });

    // 4. Check results reporting
    expect(core.info).toHaveBeenCalledWith(`Latest Tag Found: ${MOCK_TAG_NAME}`);
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('should call setFailed and exit if no tags are found', async () => {
    setupOctokitMocks([]);

    await run();

    expect(core.setFailed).toHaveBeenCalledWith('No Git tags found in the repository.');

    const octokitMock = (github.getOctokit as jest.Mock).mock.results[0]!.value;
    expect(octokitMock.rest.repos.compareCommits).not.toHaveBeenCalled();
  });

  it('should exit gracefully if the latest tag SHA matches the current HEAD SHA', async () => {
    const tagIsHead = [{ ...mockTagResponse[0], commit: { sha: CONTEXT_HEAD_SHA } }];
    setupOctokitMocks(tagIsHead);

    await run();


    expect(core.info).toHaveBeenCalledWith(
      'The latest tag is the current HEAD. No new commits to compare.'
    );
    expect(core.setFailed).not.toHaveBeenCalled();

    const octokitMock = (github.getOctokit as jest.Mock).mock.results[0]!.value;
    expect(octokitMock.rest.repos.compareCommits).not.toHaveBeenCalled();
  });

  it('should correctly handle renamed files (status=renamed)', async () => {
    const comparisonData = {
      files: [
        {
          filename: 'new/path/component.js',
          previous_filename: 'old/path/component.js',
          status: 'renamed'
        },
      ],
    };

    setupOctokitMocks(mockTagResponse, comparisonData);

    const changedFiles = await run();

    expect(changedFiles).toBeDefined();
    expect(core.setFailed).not.toHaveBeenCalled();

    if (changedFiles) {
      expect(changedFiles.removed).toEqual(['old/path/component.js']);
      expect(changedFiles.added).toEqual(['new/path/component.js']);
      expect(changedFiles.modified).toEqual([]);
      expect(core.setFailed).not.toHaveBeenCalled();
    }
  });

  it('should correctly filter files based on ignore patterns', async () => {
    const ignorePatterns = ['docs/**', 'temp.txt'];

    // override config mock
    (getConfig as jest.Mock).mockReturnValue({
        githubToken: 'mock-token',
        ignorePatterns,
    });

    setupOctokitMocks(undefined, {
      files: [
        { filename: 'file_1.js', status: 'modified' },
        { filename: 'docs/guide.md', status: 'modified' },
        { filename: 'temp.txt', status: 'added' },
        { filename: 'src/main.ts', status: 'added' },
      ]
    });

    const changedFiles = await run();

    expect(changedFiles).toBeDefined();
    expect(core.setFailed).not.toHaveBeenCalled();

    if (changedFiles) {
      expect(changedFiles.modified).toEqual(['file_1.js']);
      expect(changedFiles.added).toEqual(['src/main.ts']);
      expect(changedFiles.removed).toEqual([]);
      expect(core.setFailed).not.toHaveBeenCalled();
    }
  });
});
