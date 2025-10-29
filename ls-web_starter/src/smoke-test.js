
import { runLSWeb, stopLSWeb, setLogSink } from './ls-web.js';
setLogSink(console.log);
await runLSWeb('SET a TO 2\nADD a BY 3\nPRINT a', null);
stopLSWeb();
