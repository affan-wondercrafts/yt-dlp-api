// routes/formats.ts
import express from 'express';
import { getVideoFormats } from '../downloaders/formatParser.js';

const router = express.Router();

router.get('/', async (req: any, res: any) => {
	const url = req.query.url as string;

	if (!url) {
		return res.status(400).json({ status: 'error', message: 'Missing URL' });
	}

	try {
		const formats = await getVideoFormats(url);
		res.status(200).json({ status: 'success', data: formats });
	} catch (err) {
		console.error(err);
		res
			.status(500)
			.json({ status: 'error', message: 'Failed to fetch formats' });
	}
});

export default router;
