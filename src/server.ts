import express from 'express';
import cors from 'cors';
import { downloadVideo } from './downloaders/downloader.js'; // Note the .js extension
import formatRoutes from './routes/formats.js';
import downloadRoutes from './routes/download.js';
import path from 'path';
import fs from 'fs-extra';
// import {
// 	downloadVideoStream,
// 	getVideoFormats,
// } from './downloaders/downloadandFormatApi.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// ES Module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(
	'/downloads',
	express.static(path.join(__dirname, '../public', 'downloads')),
);

// // Create downloads directory
// export const downloadsDir = path.join(__dirname, '../public', 'downloads');
// fs.ensureDirSync(downloadsDir);

export const downloadsDir = path.join(__dirname, '..', 'public', 'downloads');
app.use('/downloads', express.static(downloadsDir));

// Create downloads directory
fs.ensureDirSync(downloadsDir);
console.log('Downloads directory created at:', downloadsDir);

app.post('/api/downloadBestVideo', async (req: any, res: any) => {
	const { url } = req.body;
	if (!url) return res.status(400).json({ error: 'Missing video URL' });

	try {
		const filePath = await downloadVideo(url);
		res.download(filePath);
		res.status(200).json({ message: 'Download started', filePath });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Download failed' });
	}
});

app.use('/api/formats', formatRoutes);
app.use('/api/download', downloadRoutes);
app.post('/api/fetch-formats', async (req: any, res: any) => {
	// await getVideoFormats(req, res);
	try {
		const { url } = req.body;

		if (!url) {
			return res.status(400).json({ error: 'URL is required' });
		}

		console.time('yt-dlp-fetch');
		const formatsJson = await new Promise<string>((resolve, reject) => {
			// const proc = spawn('yt-dlp', [
			// 	'--skip-download',
			// 	'--no-warnings',
			// 	'--no-check-certificate',
			// 	'--dump-json',
			// 	'--no-playlist',
			// 	url,
			// ]);
			const proc = spawn('yt-dlp', [
				'--dump-json',
				'--no-playlist',
				'--no-call-home',
				'--no-cache-dir',
				url,
			]);

			let data = '';
			proc.stdout.on('data', (chunk) => (data += chunk.toString()));
			proc.stderr.on('data', (err) => {
				console.error(err.toString());
			});

			proc.on('close', (code) => {
				console.timeEnd('yt-dlp-fetch');
				if (code === 0) resolve(data);
				else reject('Failed to fetch formats');
			});
		});

		const info = JSON.parse(formatsJson);
		return res.json({ info });
	} catch (error) {
		console.error('Error fetching formats:', error);
		return res.status(500).json({ error: 'Failed to fetch video formats' });
	}
});
app.post('/api/download-video', async (req: any, res: any) => {
	// await downloadVideoStream(req, res);
	try {
		const { url, formatId, isAudioOnly } = req.body;

		if (!url || !formatId) {
			return res.status(400).json({ error: 'URL and format ID are required' });
		}

		// Generate a timestamp-based unique ID for this download
		const timestamp = Date.now();
		const uniqueId = `${formatId}-${timestamp}`;

		// Step 1: Get video title for filename
		const videoTitle = await new Promise<string>((resolve, reject) => {
			const infoProc = spawn('yt-dlp', [
				'--get-title',
				'--restrict-filenames',
				url,
			]);

			let output = '';
			let error = '';

			infoProc.stdout.on('data', (data) => (output += data.toString()));
			infoProc.stderr.on('data', (data) => (error += data.toString()));

			infoProc.on('close', (code) => {
				if (code === 0) resolve(output.trim());
				else reject(new Error(`Failed to get video title: ${error}`));
			});
		});

		// Better sanitization for the title
		const sanitizedTitle = videoTitle
			.replace(/[\/\\:*?"<>|]/g, '')
			.replace(/\s+/g, '_')
			.substring(0, 100); // Limit length

		console.log('Processing download for:', sanitizedTitle);

		// Modify output template to use the uniqueId and avoid format-specific naming
		const outputTemplate = path.join(
			downloadsDir,
			`${sanitizedTitle}-${uniqueId}.%(ext)s`,
		);

		// Step 2: Prepare yt-dlp args with better formatting
		const args = ['--no-playlist', '-o', outputTemplate, '--newline'];

		if (isAudioOnly) {
			args.push('-f', formatId);
		} else {
			if (url.includes('tiktok.com')) {
				args.push(
					'--socket-timeout',
					'60',
					'--no-check-certificates',
					'-f',
					formatId,
				);
			} else {
				args.push('-f', `${formatId}+bestaudio[ext=m4a]/bestaudio`);
				args.push('--merge-output-format', 'mp4');
			}
		}

		// Add URL at the end
		args.push(url);

		const proc = spawn('yt-dlp', args);
		console.log('Running yt-dlp with args:', args);

		// Set up Server-Sent Events
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');

		proc.stdout.on('data', (chunk: { toString: () => any }) => {
			const line = chunk.toString();
			console.log('yt-dlp output:', line.trim());

			const match = line.match(
				/\[download\]\s+(\d+\.\d+)%\s+of\s+([\d.]+\w+)\s+at\s+([\d.]+\w+\/s)\s+ETA\s+(\d+:\d+)/,
			);
			if (match) {
				const [, percent, totalSize, speed, eta] = match;
				const progressData = {
					status: 'downloading',
					percent: parseFloat(percent),
					totalSize,
					speed,
					eta,
				};
				res.write(`data: ${JSON.stringify(progressData)}\n\n`);
			}
		});

		proc.stderr.on('data', (data: { toString: () => any }) => {
			console.error('yt-dlp error:', data.toString());
		});

		proc.on('close', (code: string | number) => {
			console.log('yt-dlp process closed with code:', code);

			if (code === 0) {
				const files = fs.readdirSync(downloadsDir);
				const filename = files.find((f) =>
					f.startsWith(`${sanitizedTitle}-${uniqueId}`),
				);

				if (filename) {
					console.log('Download completed:', filename);
					res.write(
						`data: ${JSON.stringify({
							status: 'completed',
							filename,
							downloadPath: `/downloads/${filename}`,
						})}\n\n`,
					);
				} else {
					console.error('Could not find downloaded file');
					res.write(
						`data: ${JSON.stringify({
							status: 'error',
							message: 'File not found after download',
						})}\n\n`,
					);
				}
			} else {
				res.write(
					`data: ${JSON.stringify({
						status: 'error',
						message: 'Download failed with code ' + code,
					})}\n\n`,
				);
			}
			res.end();
		});

		// Handle client disconnect
		req.on('close', () => {
			if (!proc.killed) {
				proc.kill();
				console.log('Download process killed due to client disconnect');
			}
		});
	} catch (error) {
		console.error('Error downloading video:', error);
		return res.status(500).json({
			error:
				'Failed to download video: ' +
				(error instanceof Error ? error.message : String(error)),
		});
	}
});

app.post('/api/direct-download', async (req: any, res: any) => {
	try {
		const { url, formatId, isAudioOnly } = req.body;
		console.log('Direct download request:', req.body);

		if (!url || !formatId) {
			return res.status(400).json({ error: 'URL and format ID are required' });
		}

		// Step 1: Get video title
		const videoTitle = await new Promise<string>((resolve, reject) => {
			const infoProc = spawn('yt-dlp', [
				'--get-title',
				'--restrict-filenames',
				url,
			]);

			let output = '';
			let error = '';

			infoProc.stdout.on('data', (data) => (output += data.toString()));
			infoProc.stderr.on('data', (data) => (error += data.toString()));

			infoProc.on('close', (code) => {
				if (code === 0) resolve(output.trim());
				else reject(new Error(`Failed to get video title: ${error}`));
			});
		});

		// Sanitize title
		const sanitizedTitle = videoTitle
			.replace(/[\/\\:*?"<>|]/g, '')
			.substring(0, 100);
		const filename = `${sanitizedTitle}.${isAudioOnly ? 'mp3' : 'mp4'}`;

		// Set response headers for download
		res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
		res.setHeader('Content-Type', isAudioOnly ? 'audio/mpeg' : 'video/mp4');

		// yt-dlp args
		// const args = ['--no-playlist', '-f', formatId, '-o', '-', url];
		const args = [
			'--no-playlist',
			'-f',
			`${
				url.includes('youtu')
					? `${formatId}+bestaudio[ext=m4a]/bestaudio`
					: formatId
			}`,
			'-o',
			'-',
			url,
		];
		if (!isAudioOnly) {
			args.push('--merge-output-format', 'mp4');
		}

		const proc = spawn('yt-dlp', args);
		console.log('yt-dlp started with:', args);

		// Pipe yt-dlp stdout to response
		proc.stdout.pipe(res);

		proc.stderr.on('data', (data) => {
			console.error('yt-dlp error:', data.toString());
		});

		proc.on('close', (code) => {
			if (code !== 0) {
				console.error('Download failed with code', code);
				if (!res.headersSent) {
					res.status(500).end('Download failed');
				}
			} else {
				console.log('yt-dlp download finished');
			}
		});

		// Abort on client disconnect
		req.on('close', () => {
			if (!proc.killed) proc.kill();
		});
	} catch (error) {
		console.error('Error downloading video:', error);
		res.status(500).json({
			error:
				'Failed to download video: ' +
				(error instanceof Error ? error.message : String(error)),
		});
	}
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
