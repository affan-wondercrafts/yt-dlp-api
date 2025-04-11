import { spawn } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import ora from 'ora';

export async function downloadVideo(url: string): Promise<string> {
	const downloadsDir = path.join(process.cwd(), 'downloads');
	await fs.ensureDir(downloadsDir);

	const spinner = ora('🔍 Fetching video information...').start();

	let videoInfo: any;
	try {
		videoInfo = await getVideoInfo(url);
		spinner.succeed('✅ Video information retrieved.');
	} catch (error) {
		spinner.fail('❌ Failed to fetch video information.');
		throw error;
	}

	const videoTitle = sanitizeFilename(videoInfo.title);
	const outputPath = path.join(downloadsDir, `${videoTitle}.mp4`);

	spinner.start('⏬ Downloading video...');

	try {
		await downloadBestFormat(url, outputPath);
		spinner.succeed('✅ Download completed.');
		return outputPath;
	} catch (error) {
		spinner.fail('❌ Download failed.');
		throw error;
	}
}

async function getVideoInfo(url: string): Promise<any> {
	return new Promise((resolve, reject) => {
		const proc = spawn('yt-dlp', ['-J', url]);

		let data = '';
		proc.stdout.on('data', (chunk) => (data += chunk.toString()));
		proc.stderr.on('data', (err) => console.error(err.toString()));
		proc.on('close', (code) => {
			if (code === 0) {
				try {
					resolve(JSON.parse(data));
				} catch (error) {
					reject('❌ Error parsing video information.');
				}
			} else {
				reject('❌ Failed to fetch video information.');
			}
		});
	});
}

async function downloadBestFormat(
	url: string,
	outputPath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const args = [
			'-f',
			'bv*+ba/b',
			'-o',
			outputPath,
			'--merge-output-format',
			'mp4',
			'--newline',
			url,
		];

		const proc = spawn('yt-dlp', args);

		proc.stdout.on('data', (data) => {
			const line = data.toString();
			const match = line.match(/\[download\]\s+(\d+\.\d+)%/);
			if (match) {
				process.stdout.clearLine(0);
				process.stdout.cursorTo(0);
				process.stdout.write(`📥 ${match[1]}% downloaded`);
			}
		});

		proc.stderr.on('data', (data) => {
			console.error(data.toString());
		});

		proc.on('close', (code) => {
			if (code === 0) {
				console.log('\n✅ Download completed!\n');
				resolve();
			} else {
				reject('Download failed.');
			}
		});
	});
}

function sanitizeFilename(filename: string): string {
	return filename.replace(/[\/\\:*?"<>|]/g, '');
}
