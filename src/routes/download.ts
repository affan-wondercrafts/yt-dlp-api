// // routes/download.ts
// import express from 'express';
// import { downloadVideoToTemp } from '../downloaders/downloaderApiFunction.js';

// const router = express.Router();

// router.get('/', async (req: any, res: any) => {
// 	const url = req.query.url as string;
// 	const format = req.query.format as string;

// 	if (!url || !format)
// 		return res.status(400).json({ error: 'Missing url or format' });

// 	try {
// 		const filePath = await downloadVideoToTemp(url, format);

// 		res.download(filePath, (err: any) => {
// 			if (err) {
// 				console.error('Send error:', err);
// 				res.status(500).json({ error: 'File transfer failed' });
// 			}
// 		});
// 	} catch (err) {
// 		console.error(err);
// 		res.status(500).json({ error: 'Download failed' });
// 	}
// });

// export default router;

import express from 'express';
import { downloadVideoToStorage } from '../downloaders/downloaderApiFunction.js';

const router = express.Router();

router.post('/', async (req: any, res: any) => {
	const { url, format } = req.body; // Expecting JSON body with url and format
	console.log('Received request:', req.body);
	if (!url || !format) {
		return res.status(400).json({ error: 'Missing URL or format' });
	}

	try {
		// Step 1: Download the video to the server's 'downloads' directory
		const filePath = await downloadVideoToStorage(url, format);
		console.log('File downloaded to:', filePath);

		// Step 2: Serve the file to the user for download
		res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');
		res.download(filePath, (err: any) => {
			if (err) {
				console.error('Send error:', err);
				res.status(500).json({ error: 'File transfer failed' });
			}
		});
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: 'Download failed' });
	}
});

export default router;
