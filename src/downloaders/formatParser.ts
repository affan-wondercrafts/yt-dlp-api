import { spawn } from 'child_process';

export async function getVideoFormats(url: string) {
	const data = await new Promise<string>((resolve, reject) => {
		const proc = spawn('yt-dlp', ['-J', url]);
		let json = '';

		proc.stdout.on('data', (chunk) => (json += chunk));
		proc.stderr.on('data', (err) => console.error(err.toString()));
		proc.on('close', (code) =>
			code === 0 ? resolve(json) : reject('Failed to fetch formats'),
		);
	});

	const info = JSON.parse(data);

	const video = info.formats.filter((f: any) => f.vcodec !== 'none');
	const audio = info.formats.filter(
		(f: any) => f.vcodec === 'none' && f.acodec !== 'none',
	);

	return { title: info.title, video, audio };
}
