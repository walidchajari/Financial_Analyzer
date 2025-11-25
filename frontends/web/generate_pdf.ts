
import { downloadAnalysisPdf } from './lib/pdf';
import * as fs from 'fs';
import * as path from 'path';

// Resolve the path to analysis_response.json relative to the script
const jsonPath = path.resolve(__dirname, '../../analysis_response.json');
const analysisData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

downloadAnalysisPdf(analysisData);

console.log('PDF generated successfully: analyse-AAPL.pdf');
