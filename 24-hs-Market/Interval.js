﻿exports.newInterval = function newInterval(BOT) {

    let bot = BOT;
    const ROOT_DIR = '../';
    const GMT_SECONDS = ':00.000 GMT+0000';
    const GMT_MILI_SECONDS = '.000 GMT+0000';
    const ONE_DAY_IN_MILISECONDS = 24 * 60 * 60 * 1000;

    const MODULE_NAME = "Interval";
    const LOG_INFO = true;

    const EXCHANGE_NAME = "Poloniex";
    const EXCHANGE_ID = 1;

    const TRADES_FOLDER_NAME = "Trades";

    const CANDLES_FOLDER_NAME = "Candles";
    const CANDLES_ONE_MIN = "One-Min";

    const VOLUMES_FOLDER_NAME = "Volumes";
    const VOLUMES_ONE_MIN = "One-Min";

    const GO_RANDOM = false;
    const FORCE_MARKET = 2;     // This allows to debug the execution of an specific market. Not intended for production. 

    const MARKETS_MODULE = require(ROOT_DIR + 'Markets');

    const DEBUG_MODULE = require(ROOT_DIR + 'Debug Log');
    const logger = DEBUG_MODULE.newDebugLog();
    logger.fileName = MODULE_NAME;
    logger.bot = bot;

    interval = {
        initialize: initialize,
        start: start
    };

    let markets;

    const AZURE_FILE_STORAGE = require(ROOT_DIR + 'Azure File Storage');
    let charlyAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);
    let bruceAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);
    let oliviaAzureFileStorage = AZURE_FILE_STORAGE.newAzureFileStorage(bot);

    const UTILITIES = require(ROOT_DIR + 'Utilities');
    let utilities = UTILITIES.newUtilities(bot);

    let year;
    let month;

    return interval;

    function initialize(yearAssigend, monthAssigned, callBackFunction) {

        try {

            year = yearAssigend;
            month = monthAssigned;

            month = utilities.pad(month, 2); // Adding a left zero when needed.

            logger.fileName = MODULE_NAME + "-" + year + "-" + month;

            const logText = "[INFO] initialize - Entering function 'initialize' " + " @ " + year + "-" + month;
            console.log(logText);
            logger.write(logText);

            charlyAzureFileStorage.initialize("Charly");
            bruceAzureFileStorage.initialize("Bruce");
            oliviaAzureFileStorage.initialize("Olivia");

            markets = MARKETS_MODULE.newMarkets(bot);
            markets.initialize(callBackFunction);


        } catch (err) {

            const logText = "[ERROR] initialize - ' ERROR : " + err.message;
            console.log(logText);
            logger.write(logText);

        }
    }

/*

This process is going to do the following:

Read the candles and volumes from Bruce and produce a single Index File for each market with daily candles and volumes. 

*/

    function start(callBackFunction) {

        try {

            if (LOG_INFO === true) {
                logger.write("[INFO] Entering function 'start', with year = " + year + " and month = " + month);
            }

            let processDate = new Date(year + "-" + month + "-1 00:00:00.000 GMT+0000");

            let lastMinuteOfMonth = new Date(year + "-" + month + "-1 00:00:00.000 GMT+0000");

            lastMinuteOfMonth.setUTCMonth(lastMinuteOfMonth.getUTCMonth() + 1);          // First we go 1 month into the future.
            lastMinuteOfMonth.setUTCSeconds(lastMinuteOfMonth.getUTCSeconds() - 30);    // Then we go back 30 seconds, or to the last minute of the original month.

            let thisDatetime = new Date();

            if ((year === thisDatetime.getUTCFullYear() && parseInt(month) > thisDatetime.getUTCMonth() + 1) || year > thisDatetime.getUTCFullYear()) {

                logger.write("[INFO] We are too far in the future. Interval will not execute. Sorry.");
                return;

            }

            let atHeadOfMarket;         // This tell us if we are at the month which includes the head of the market according to current datetime.

            if ((year === thisDatetime.getUTCFullYear() && parseInt(month) === thisDatetime.getUTCMonth() + 1)) {

                atHeadOfMarket = true;

            } else {

                atHeadOfMarket = false;

            }

            let nextIntervalExecution = false; // This tell weather the Interval module will be executed again or not. By default it will not unless some hole have been found in the current execution.

            let marketQueue;            // This is the queue of all markets to be procesesd at each interval.
            let market = {              // This is the current market being processed after removing it from the queue.
                id: 0,
                assetA: "",
                assetB: ""
            };

            let lastCandleFile;         // Datetime of the last file included on the Index File.
            let firstTradeFile;         // Datetime of the first trade file in the whole market history.
            let maxCandleFile;          // Datetime of the last file available to be included in the Index File.

            marketsLoop(); 

            /*
    
            At every run, the process needs to loop through all the markets at this exchange.
            The following functions marketsLoop(), openMarket(), closeMarket() and closeAndOpenMarket() controls the serialization of this processing.

            */

            function marketsLoop() {

                try {

                    if (LOG_INFO === true) {
                        logger.write("[INFO] Entering function 'marketsLoop'");
                    }

                    markets.getMarketsByExchange(EXCHANGE_ID, onMarketsReady);

                    function onMarketsReady(marketsArray) {

                        marketQueue = JSON.parse(marketsArray);

                        openMarket(); // First execution and entering into the real loop.

                    }
                }
                catch (err) {
                    const logText = "[ERROR] 'marketsLoop' - ERROR : " + err.message;
                    logger.write(logText);
                }
            }

            function openMarket() {

                // To open a Market means picking a new market from the queue.

                try {

                    if (LOG_INFO === true) {
                        logger.write("[INFO] Entering function 'openMarket'");
                    }


                    if (marketQueue.length === 0) {

                        if (LOG_INFO === true) {
                            logger.write("[INFO] 'openMarket' - marketQueue.length === 0");
                        }

                        const logText = "[WARN] We processed all the markets.";
                        logger.write(logText);

                        callBackFunction(nextIntervalExecution);

                        return;
                    }

                    if (GO_RANDOM === true) {
                        const index = parseInt(Math.random() * (marketQueue.length - 1));

                        market.id = marketQueue[index][0];
                        market.assetA = marketQueue[index][1];
                        market.assetB = marketQueue[index][2];
                        market.status = marketQueue[index][3];

                        marketQueue.splice(index, 1);
                    } else {
                        let marketRecord = marketQueue.shift();

                        market.id = marketRecord[0];
                        market.assetA = marketRecord[1];
                        market.assetB = marketRecord[2];
                        market.status = marketRecord[3];

                        if (FORCE_MARKET > 0) {
                            if (FORCE_MARKET !== market.id) {
                                closeAndOpenMarket();
                                return;
                            }
                        }
                    }

                    if (LOG_INFO === true) {
                        logger.write("[INFO] 'openMarket' - marketQueue.length = " + marketQueue.length);
                        logger.write("[INFO] 'openMarket' - market sucessfully opened : " + market.assetA + "_" + market.assetB);
                    }

                    if (market.status === markets.ENABLED) {

                        getStatusReport();

                    } else {

                        logger.write("[INFO] 'openMarket' - market " + market.assetA + "_" + market.assetB + " skipped because its status is not valid. Status = " + market.status);
                        closeAndOpenMarket();
                        return;

                    }


                }
                catch (err) {
                    const logText = "[ERROR] 'openMarket' - ERROR : " + err.message;
                    logger.write(logText);
                    closeMarket();
                }
            }

            function closeMarket() {

                if (LOG_INFO === true) {
                    logger.write("[INFO] Entering function 'closeMarket'");
                }

            }

            function closeAndOpenMarket() {

                if (LOG_INFO === true) {
                    logger.write("[INFO] Entering function 'closeAndOpenMarket'");
                }

                openMarket();
            }

            /*

            The following code executes for each market.

            */

            function getStatusReport() {

                try {

                    let reportFilePath;
                    let fileName = "Status.Report." + market.assetA + '_' + market.assetB + ".json"

                    getHistoricTrades();

                    function getHistoricTrades() {

                        /*

                        We need to know where is the begining of the market, since that will help us know where the Index Files should start. 

                        */

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + "Historic-Trades";

                        charlyAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                firstTradeFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + statusReport.lastFile.hours + ":" + statusReport.lastFile.minutes + GMT_SECONDS);

                                getOneMinDailyCandlesVolumes();

                            } catch (err) {

                                const logText = "[INFO] 'getStatusReport' - Failed to read main Historic Trades Status Report for market " + market.assetA + '_' + market.assetB + " . Skipping it. ";
                                logger.write(logText);

                                closeAndOpenMarket();
                            }
                        }
                    }

                    function getOneMinDailyCandlesVolumes() {

                        /* If the process run and was interrupted, there should be a status report that allows us to resume execution. */

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + "One-Min-Daily-Candles-Volumes" + "/" + year + "/" + month;

                        bruceAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                maxCandleFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + "00:00" + GMT_SECONDS);

                                getThisProcessReport();

                            } catch (err) {

                                /*

                                It might happen that the file content is corrupt or it does not exist. In either case we will point our lastCandleFile
                                to the last day of the previous month.

                                */

                                lastCandleFile = new Date(processDate.valueOf() - ONE_DAY_IN_MILISECONDS);
                                findLastCandleCloseValue();

                            }
                        }
                    }

                    function getThisProcessReport() {

                        /* If the process run and was interrupted, there should be a status report that allows us to resume execution. */

                        reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

                        oliviaAzureFileStorage.getTextFile(reportFilePath, fileName, onStatusReportReceived, true);

                        function onStatusReportReceived(text) {

                            let statusReport;

                            try {

                                statusReport = JSON.parse(text);

                                lastCandleFile = new Date(statusReport.lastFile.year + "-" + statusReport.lastFile.month + "-" + statusReport.lastFile.days + " " + "00:00" + GMT_SECONDS);

                                findPreviousContent();

                            } catch (err) {

                                /*

                                It might happen that the file content is corrupt or it does not exist. In either case we will point our lastCandleFile
                                to the begining of the market.

                                */

                                lastCandleFile = new Date(firstTradeFile.getUTCFullYear() + "-" + (firstTradeFile.getUTCMonth() + 1) + "-" + firstTradeFile.getUTCDate() + " " + "00:00" + GMT_SECONDS);

                                lastCandleFile = new Date(lastCandleFile.valueOf() - ONE_DAY_IN_MILISECONDS); // Go back one day to start well.

                                buildCandles();

                            }
                        }
                    }

                }
                catch (err) {
                    const logText = "[ERROR] 'getStatusReport' - ERROR : " + err.message;
                    logger.write(logText);
                    closeMarket();
                }
            }

            function findPreviousContent() {

                try {

                    let previousCandles;
                    let previousVolumes;

                    getCandles();

                    function getCandles() {

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME;

                        oliviaAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                        function onFileReceived(text) {

                            let candlesFile;

                            try {

                                candlesFile = JSON.parse(text);

                                previousCandles = candlesFile;

                                getVolumes();

                            } catch (err) {

                                const logText = "[ERR] 'findPreviousContent' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();
                            }
                        }
                    }

                    function getVolumes() {

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME;

                        oliviaAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                        function onFileReceived(text) {

                            let volumesFile;

                            try {

                                volumesFile = JSON.parse(text);

                                previousVolumes = volumesFile;

                                buildCandles(previousCandles, previousVolumes);

                            } catch (err) {

                                const logText = "[ERR] 'findPreviousContent' - Empty or corrupt volume file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();
                            }
                        }
                    } 
                }
                catch (err) {
                const logText = "[ERROR] 'findPreviousContent' - ERROR : " + err.message;
                logger.write(logText);
                closeMarket();
                }

            }

            function buildCandles(previousCandles, previousVolumes) {

                /*

                Here we are going to scan the candle and volume files to generate daily candles in only one Index File.

                */

                let outputCandles = [];
                let outputVolumes = [];

                try {

                    if (previousCandles !== undefined) {

                        for (let i = 0; i < previousCandles.length; i++) {

                            let candle = {
                                open: previousCandles[i][2],
                                close: previousCandles[i][3],
                                min: previousCandles[i][0],
                                max: previousCandles[i][1],
                                begin: previousCandles[i][4],
                                end: previousCandles[i][5]
                            };

                            outputCandles.push(candle);
                        }

                    }

                    if (previousVolumes !== undefined) {

                        for (let i = 0; i < previousVolumes.length; i++) {

                            let volume = {
                                begin: previousVolumes[i][2],
                                end: previousVolumes[i][3],
                                buy: previousVolumes[i][0],
                                sell: previousVolumes[i][1]
                            };

                            outputVolumes.push(volume);
                        }

                    }

                    advanceTime();

                    function advanceTime() {

                        lastCandleFile = new Date(lastCandleFile.valueOf() + ONE_DAY_IN_MILISECONDS);

                        const logText = "[INFO] New processing time @ " + lastCandleFile.getUTCFullYear() + "/" + (lastCandleFile.getUTCMonth() + 1) + "/" + lastCandleFile.getUTCDate() + ".";
                        console.log(logText);
                        logger.write(logText);

                        /* Validation that we are not going past the head of the market. */

                        if (lastCandleFile.valueOf() > maxCandleFile.valueOf()) {

                            const logText = "[INFO] 'buildCandles' - Head of the market found @ " + lastCandleFile.getUTCFullYear() + "/" + (lastCandleFile.getUTCMonth() + 1) + "/" + lastCandleFile.getUTCDate() + ".";
                            logger.write(logText);

                            closeAndOpenMarket();

                            return;

                        }

                        nextCandleFile();

                    }

                    function nextCandleFile() {

                        let dateForPath = lastCandleFile.getUTCFullYear() + '/' + utilities.pad(lastCandleFile.getUTCMonth() + 1, 2) + '/' + utilities.pad(lastCandleFile.getUTCDate(), 2);
                        let fileName = market.assetA + '_' + market.assetB + ".json"
                        let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME + '/' + CANDLES_ONE_MIN + '/' + dateForPath;

                        bruceAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                        function onFileReceived(text) {

                            let candlesFile;

                            try {

                                candlesFile = JSON.parse(text);

                            } catch (err) {

                                const logText = "[ERR] 'buildCandles' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();

                                return;
                            }

                            let outputCandle = {
                                open: 0,
                                close: 0,
                                min: 0,
                                max: 0,
                                begin: 0,
                                end: 0
                            };

                            if (candlesFile.length > 0) {

                                outputCandle.open = candlesFile[0][2];
                                outputCandle.close = candlesFile[candlesFile.length - 1][3];

                                outputCandle.min = candlesFile[0][0];
                                outputCandle.max = candlesFile[0][1];

                                outputCandle.begin = candlesFile[0][4];
                                outputCandle.end = candlesFile[candlesFile.length - 1][5];

                            } else {

                                const logText = "[ERR] 'buildCandles' - No candles found at file " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();

                                return;

                            }

                            for (let i = 0; i < candlesFile.length; i++) {

                                let candle = {
                                    open: candlesFile[i][2],
                                    close: candlesFile[i][3],
                                    min: candlesFile[i][0],
                                    max: candlesFile[i][1],
                                    begin: candlesFile[i][4],
                                    end: candlesFile[i][5]
                                };

                                if (candle.min < outputCandle.min) {

                                    outputCandle.min = candle.min;

                                }

                                if (candle.max > outputCandle.max) {

                                    outputCandle.max = candle.max;

                                }

                            }

                            outputCandles.push(outputCandle);

                            nextVolumeFile();

                        }
                    }

                    function nextVolumeFile() {

                        let dateForPath = lastCandleFile.getUTCFullYear() + '/' + utilities.pad(lastCandleFile.getUTCMonth() + 1, 2) + '/' + utilities.pad(lastCandleFile.getUTCDate(), 2);
                        let fileName = market.assetA + '_' + market.assetB + ".json"
                        let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME + '/' + VOLUMES_ONE_MIN + '/' + dateForPath;

                        bruceAzureFileStorage.getTextFile(filePath, fileName, onFileReceived, true);

                        function onFileReceived(text) {

                            let volumesFile;

                            try {

                                volumesFile = JSON.parse(text);

                            } catch (err) {

                                const logText = "[ERR] 'buildCandles' - Empty or corrupt candle file found at " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();

                                return;
                            }

                            let outputVolume = {
                                buy: 0,
                                sell: 0,
                                begin: 0,
                                end: 0
                            };

                            if (volumesFile.length > 0) {

                                outputVolume.begin = volumesFile[0][2];
                                outputVolume.end = volumesFile[volumesFile.length - 1][3];

                            } else {

                                const logText = "[ERR] 'buildCandles' - No volumes found at file " + filePath + " for market " + market.assetA + '_' + market.assetB + " . Skipping this Market. ";
                                logger.write(logText);

                                closeAndOpenMarket();

                                return;

                            }

                            for (let i = 0; i < volumesFile.length; i++) {

                                let volume = {
                                    buy: volumesFile[i][0],
                                    sell: volumesFile[i][1],
                                    begin: volumesFile[i][2],
                                    end: volumesFile[i][3]
                                };

                                outputVolume.buy = outputVolume.buy + volume.buy;
                                outputVolume.sell = outputVolume.sell + volume.sell;

                            }

                            outputVolumes.push(outputVolume);

                            writeFiles(lastCandleFile, outputCandles, outputVolumes, advanceTime);
                        }
                    }
                } 
                     
                catch (err) {
                    const logText = "[ERROR] 'buildCandles' - ERROR : " + err.message;
                logger.write(logText);
                closeMarket();
                }

            }

            function writeFiles(date, candles, volumes, callBack) {

                /*

                Here we will write the contents of the Candles and Volumens files.

                */

                try {

                    writeCandles();

                    function writeCandles() {

                        let separator = "";
                        let fileRecordCounter = 0;

                        let fileContent = "";

                        for (i = 0; i < candles.length; i++) {

                            let candle = candles[i];

                            fileContent = fileContent + separator + '[' + candles[i].min + "," + candles[i].max + "," + candles[i].open + "," + candles[i].close + "," + candles[i].begin + "," + candles[i].end + "]";

                            if (separator === "") { separator = ","; }

                            fileRecordCounter++;

                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + CANDLES_FOLDER_NAME + "/" + bot.process;

                        utilities.createFolderIfNeeded(filePath, oliviaAzureFileStorage, onFolderCreated);

                        function onFolderCreated() {

                            oliviaAzureFileStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                const logText = "[WARN] Finished with File @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName + "";
                                console.log(logText);
                                logger.write(logText);

                                writeVolumes();
                            }
                        }

                    }

                    function writeVolumes() {

                        let separator = "";
                        let fileRecordCounter = 0;

                        let fileContent = "";

                        for (i = 0; i < volumes.length; i++) {

                            let candle = volumes[i];

                            fileContent = fileContent + separator + '[' + volumes[i].buy + "," + volumes[i].sell + "," + volumes[i].begin + "," + volumes[i].end + "]";

                            if (separator === "") { separator = ","; }

                            fileRecordCounter++;

                        }

                        fileContent = "[" + fileContent + "]";

                        let fileName = '' + market.assetA + '_' + market.assetB + '.json';

                        let filePath = EXCHANGE_NAME + "/Output/" + VOLUMES_FOLDER_NAME + "/" + bot.process;

                        utilities.createFolderIfNeeded(filePath, oliviaAzureFileStorage, onFolderCreated);

                        function onFolderCreated() {

                            oliviaAzureFileStorage.createTextFile(filePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                const logText = "[WARN] Finished with File @ " + market.assetA + "_" + market.assetB + ", " + fileRecordCounter + " records inserted into " + filePath + "/" + fileName + "";
                                console.log(logText);
                                logger.write(logText);

                                writeReport();
                            }
                        }
                    }

                    function writeReport() {

                        writeStatusReport(date, onStatusReportWritten);

                        function onStatusReportWritten() {

                            callBack();

                        }
                    }
                }
                     
                catch (err) {
                    const logText = "[ERROR] 'writeFiles' - ERROR : " + err.message;
                logger.write(logText);
                closeMarket();
                }
            }

            function writeStatusReport(lastFileDate, callBack) {

                if (LOG_INFO === true) {
                    logger.write("[INFO] Entering function 'writeStatusReport'");
                }

                try {

                    let reportFilePath = EXCHANGE_NAME + "/Processes/" + bot.process;

                    utilities.createFolderIfNeeded(reportFilePath, oliviaAzureFileStorage, onFolderCreated);

                    function onFolderCreated() {

                        try {

                            let fileName = "Status.Report." + market.assetA + '_' + market.assetB + ".json";

                            let report = {
                                lastFile: {
                                    year: lastFileDate.getUTCFullYear(),
                                    month: (lastFileDate.getUTCMonth() + 1),
                                    days: lastFileDate.getUTCDate()
                                }
                            };

                            let fileContent = JSON.stringify(report); 

                            oliviaAzureFileStorage.createTextFile(reportFilePath, fileName, fileContent + '\n', onFileCreated);

                            function onFileCreated() {

                                if (LOG_INFO === true) {
                                    logger.write("[INFO] 'writeStatusReport' - Content written: " + fileContent);
                                }

                                callBack();
                            }
                        }
                        catch (err) {
                            const logText = "[ERROR] 'writeStatusReport - onFolderCreated' - ERROR : " + err.message;
                            logger.write(logText);
                            closeMarket();
                        }
                    }

                }
                catch (err) {
                    const logText = "[ERROR] 'writeStatusReport' - ERROR : " + err.message;
                    logger.write(logText);
                    closeMarket();
                }

            }

        }
        catch (err) {
            const logText = "[ERROR] 'Start' - ERROR : " + err.message;
            logger.write(logText);
        }
    }
};