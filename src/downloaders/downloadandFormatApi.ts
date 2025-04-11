import { Request, Response } from 'express';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { downloadsDir } from '../server';

// Define types
interface FormatRequest {
	url: string;
}

interface DownloadRequest {
	url: string;
	formatId: string;
	isAudioOnly: boolean;
}

interface Format {
	vcodec: string;
	acodec: string;
	ext: string;
	format_id: string;
	filesize: number;
}

interface VideoInfo {
	title: string;
	thumbnail: string;
	duration: number;
	formats: Format[];
	is_live: boolean;
	extractor: string;
}

// API Routes
// 1. Fetch formats route
export const getVideoFormats = async (req: any, res: any) => {
	try {
		const { url } = req.body;

		if (!url) {
			return res.status(400).json({ error: 'URL is required' });
		}

		console.time('yt-dlp-fetch');
		const formatsJson = await new Promise<string>((resolve, reject) => {
			const proc = spawn('yt-dlp', [
				'--skip-download',
				'--no-warnings',
				'--no-check-certificate',
				'--dump-json',
				'--no-playlist',
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
};

// 2. Download route
export const downloadVideoStream = async (req: any, res: any) => {
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

		proc.stdout.on('data', (chunk) => {
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

		proc.stderr.on('data', (data) => {
			console.error('yt-dlp error:', data.toString());
		});

		proc.on('close', (code) => {
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
};
