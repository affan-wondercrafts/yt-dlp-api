// import { spawn } from 'child_process';
// import fsExtra from 'fs-extra';
// import path from 'path';
// import os from 'os';

// export async function downloadVideoToTemp(
// 	url: string,
// 	format: string,
// ): Promise<string> {
// 	const tempDir = path.join(os.tmpdir(), 'yt-dlp-api');
// 	await fsExtra.ensureDir(tempDir);

// 	const outputPath = path.join(tempDir, `video-%(format_id)s.%(ext)s`);

// 	const args = [
// 		'-f',
// 		format,
// 		'-o',
// 		outputPath,
// 		'--merge-output-format',
// 		'mp4',
// 		'--no-playlist',
// 		url,
// 	];

// 	await new Promise<void>((resolve, reject) => {
// 		const proc = spawn('yt-dlp', args);

// 		proc.stderr.on('data', (err) => console.error(err.toString()));
// 		proc.on('close', (code) =>
// 			code === 0 ? resolve() : reject('Download failed'),
// 		);
// 	});

// 	const files = await fsExtra.readdir(tempDir);
// 	const latest = files
// 		.map((f) => path.join(tempDir, f))
// 		.sort(
// 			(a, b) => fsExtra.statSync(b).mtimeMs - fsExtra.statSync(a).mtimeMs,
// 		)[0];

// 	return latest;
// }

import { spawn } from 'child_process';
import fsExtra from 'fs-extra';
import path from 'path';

export async function downloadVideoToStorage(
	url: string,
	format: string,
): Promise<string> {
	const downloadsDir = path.join(process.cwd(), 'downloads'); // Change to 'downloads' directory
	await fsExtra.ensureDir(downloadsDir);

	const outputPath = path.join(downloadsDir, `video-%(format_id)s.%(ext)s`);

	const args = [
		'-f',
		format,
		'-o',
		outputPath,
		'--merge-output-format',
		'mp4',
		'--no-playlist',
		url,
	];

	await new Promise<void>((resolve, reject) => {
		const proc = spawn('yt-dlp', args);

		proc.stderr.on('data', (err) => console.error(err.toString()));
		proc.on('close', (code) =>
			code === 0 ? resolve() : reject('Download failed'),
		);
	});

	// Get the latest file from the 'downloads' directory
	const files = await fsExtra.readdir(downloadsDir);
	const latest = files
		.map((f) => path.join(downloadsDir, f))
		.sort(
			(a, b) => fsExtra.statSync(b).mtimeMs - fsExtra.statSync(a).mtimeMs,
		)[0];

	return latest;
}
