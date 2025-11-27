import { run } from '../src/index';
import * as core from '@actions/core';
import * as github from '@actions/github';

import { mockTagResponse } from './mockdata';
import { mockSaveChangelog, mockSendWebhook, setupOctokitMocks } from './setupMocks';
import { getConfig } from '../src/config';

describe('run', () => {
  beforeEach(() => {
    // clear all mock function calls before each test
    jest.clearAllMocks();

    (getConfig as jest.Mock).mockReturnValue({
      githubToken: 'mock-token',
      discordWebhook: process.env.DISCORD_WEBHOOK || false,
      changelogDir: process.env.CHANGELOG_DIR || false,
      changelogFilename: process.env.CHANGELOG_FILENAME || false,
      ignorePatterns: [],
    });

    // (core.setFailed as jest.Mock).mockImplementation((msg: string) => console.error(`[JEST] core.setFailed("${msg}")`));
    // (core.info as jest.Mock).mockImplementation((msg: string) => console.log(`[JEST] core.info("${msg}")`));

    mockSendWebhook.mockClear();
    mockSaveChangelog.mockClear();
  });

  it('should call setFailed and exit if no tags are found', async () => {
    setupOctokitMocks([]);

    await run();

    const octokitMock = (github.getOctokit as jest.Mock).mock.results[0]!.value;

    expect(octokitMock.rest.repos.listTags).toHaveBeenCalled();
    expect(octokitMock.rest.repos.compareCommits).not.toHaveBeenCalled();

    expect(core.setFailed).toHaveBeenCalledWith('No Git tags found in the repository.');
  });

  it('should fail if only one release', async () => {
    setupOctokitMocks(mockTagResponse.slice(0, 1));

    const changedFiles = await run();

    expect(core.info).toHaveBeenCalledWith('Fetching latest tag...');

    const octokitMock = (github.getOctokit as jest.Mock).mock.results[0]!.value;
    expect(octokitMock.rest.repos.compareCommits).not.toHaveBeenCalledWith();

    expect(changedFiles).toBeUndefined();
    expect(core.info).toHaveBeenCalledWith('No other releases to compare');
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

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(changedFiles).toBeDefined();

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
