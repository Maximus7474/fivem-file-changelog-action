import * as core from '@actions/core';
import { SendWebhook } from './webhook';
import { SaveChangelog } from './saveChangelog';
import { getFileChangelog } from './getChangelog';
import { CHANGELOG_DIR, DISCORD_WEBHOOK } from './config';

export async function run() {
  try {
    const data = await getFileChangelog();

    if (!data) return;
    const { changedFiles, version } = data;

    if (DISCORD_WEBHOOK) await SendWebhook(version, changedFiles, core);
    if (CHANGELOG_DIR) await SaveChangelog(version, changedFiles, core);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred.');
    }
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
