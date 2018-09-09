const AWS = require('aws-sdk');
const uuid = require('uuid');
const reqPromise = require('request-promise');
const cheerio = require('cheerio');
const fs = require('fs');
let credentials = new AWS.SharedIniFileCredentials({profile: 'smash'});
AWS.config.credentials = credentials;
AWS.config.update({region: 'us-west-2'});

let sqs = new AWS.SQS();
let s3 = new AWS.S3();
const selectors = ["contact", "about", "location", "faq"];

function parameterizeURL(url) {
	return {
		// followAllRedirects: true,
		uri: url,
		transform: (body) => {
			return cheerio.load(body, { normalizeWhitespace: true })}};
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function processQueueMessage(queue, resultsBkt) {
	var params = {
		QueueUrl: queue,
	  	MaxNumberOfMessages: 1,
		VisibilityTimeout: 120
	};
	sqs.receiveMessage(params, function(err, data) {
		if (err) { console.log('1', err, err.stack) }
		// else { sendBagToBucket(resultsBkt, data.Messages[0]) }
		else {
			// console.log(JSON.stringify(data))
			scrape(resultsBkt, data.Messages[0].Body)
		}
	});
}

function sendBagToBucket(resultsBkt, resId, bag) {
	var params = {
		Body: bag,
		Bucket: resultsBkt,
		Key: resId
	};
	// console.log(JSON.stringify(params));
	s3.putObject(params, function(err, data) {
		if (err) { console.log('2', err, err.stack) }
		else {
			// sqs.deleteMessage(msgHandle);
			console.log(data);
			// sleep(10);
		}
	});
}

function scrape(resultBkt, assignment) {
	let resId = assignment.split(',')[0];
	let url = assignment.split(',')[1];
	// console.log("resId: " + resId + " & url: " + url);
	let opts = parameterizeURL(url);
	let links = [];
	let bags = [];

	reqPromise(opts)
		.then(($) => {
			let v;
			selectors.forEach((selector, i) => {
				v = $('a:contains("' + selector + '")');
				links.push(v.attr('href'));
			});

			return links;
		})
		.then((lnkAddrs) => {
			return lnkAddrs.forEach((lnkAddr, i) => {
				if (typeof lnkAddr !== "undefined") {
					reqPromise(parameterizeURL(lnkAddr))
						.then((lnkPage) => {
							let textBody = lnkPage.text().trim()
								.replace(/&nbsp;/g, '')
								.replace(/<[^\/>][^>]*><\/[^>]+>/g, "")
								.replace(/\n/g, "");
							bags.push(textBody);

							return bags;
						})
						.catch((err) => { console.log("2Error: " + err) });
				}
			});
		})
		.then((bag) => {
			let bagWrapper = {
				id: resId,
				url: url,
				data: bag
			}
			// console.log(JSON.stringify(bagWrapper));
			sendBagToBucket(resultBkt, resId, JSON.stringify(bagWrapper));
		})
		.catch((err) => { console.log("3Error: " + err) })
}

for (let i = 0; i <= 90; i++) {
	processQueueMessage(
		'https://sqs.us-west-2.amazonaws.com/088617881078/backlog_crawlBot',
		'endurance-crawl-bags');
}
