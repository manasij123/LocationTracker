import "dotenv/config";
import { createApp } from "./app";
import { startExpirationJob } from "./services/expirationJob";
import { startLiveTrackRetentionJob } from "./services/liveTrackRetention";
import { startActivityRetentionJob } from "./services/activityRetention";

const port = Number(process.env.PORT) || 4000;
const app = createApp();

app.listen(port, () => {
  console.log(`SpotShare API listening on http://localhost:${port}`);
});

startExpirationJob();
startLiveTrackRetentionJob();
startActivityRetentionJob();
