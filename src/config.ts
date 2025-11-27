import * as core from '@actions/core';

export const GITHUB_TOKEN = core.getInput('github_token', { required: true });
export const DISCORD_WEBHOOK = core.getInput('webhook', { required: false }) || false;
export const CHANGELOG_DIR = core.getInput('changelog', { required: false }) || false;
export const CHANGELOG_FILENAME = core.getInput('changelog_filename', { required: false });
