const AWS = require('aws-sdk');
const uuid = require('uuid');
const reqPromise = require('request-promise');
const cheerio = require('cheerio');
const fs = require('fs');
const sleep = require('system-sleep');

let credentials = new AWS.SharedIniFileCredentials();
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

function sleepCustom (time) {
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
			if(data.Messages && data.Messages.length > 0){
				scrape(resultsBkt, data.Messages[0].Body);

				var deleteParams = {
					QueueUrl: queue,
					ReceiptHandle: data.Messages[0].ReceiptHandle
				  };

				sqs.deleteMessage(deleteParams);
			}			
		}
	});
}

function sendBagToBucket(resultsBkt, resId, bag) {
	var params = {
		Body: bag,
		Bucket: resultsBkt,
		Key: resId
	};	
	s3.putObject(params, function(err, data) {
		if (err) { console.log('2', err, err.stack) }
		else {
			// sqs.deleteMessage(msgHandle);
			// console.log(data);
			sleep(1000);
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
			//traverse the a elements first then check for lowercase, text could be lowercase
			$( 'a' ).each(function( index ) {						
				selectors.forEach((selector, i) => {					
					if($( this ).html().toLowerCase().indexOf(selector) > -1){
						links.push($( this ).attr('href'));
					}									
					
				});
			});					
			return links;
		})
		.then((lnkAddrs) => {
			let promises = [];
			lnkAddrs.forEach((lnkAddr, i) => {
				if (typeof lnkAddr !== "undefined") {				
					let validUrl = (urlRegex(lnkAddr,{}).length > 0) ? lnkAddr : url+lnkAddr					
					promises.push(reqPromise(parameterizeURL(validUrl))
						.then((lnkPage) => {
							let textBody = lnkPage.text().trim();							
							let {city, state } = getCityState(textBody);
							// result = {city,state,data:textBody};
							result = {path:validUrl,city,state};
							bags.push(result);							
							return result;
						})
						.catch((err) => { console.log("2Error: " + err) }));
				}				
			});
			return Promise.all(promises);
		})
		.then((bag) => {			
			let bagWrapper = {
				id: resId,
				url: url,
				data: bags
			}					
			sendBagToBucket(resultBkt, resId, JSON.stringify(bagWrapper));
		})
		.catch((err) => { console.log("3Error: " + err) })
}

function getCityState(body) {
	try{
		let cityResult = cityRegex(body).concat(cityAbbrRegex(body));
		let city = toStringAndFilterDups(cityResult.map(c => c.split(',')[0]));
		let state = toStringAndFilterDups(stateRegex(body)
			.concat(stateAbbrRegex(body))
			.map(s => s.replace(', ','')));

		return {city,state};
	}catch(err){
		return {city:'',state:''};
	}	
}

function toStringAndFilterDups(arr) {
	let unique_array = Array.from(new Set(arr));
    return unique_array.toString();
}

function urlRegex(str,config) {
	return regexParser(
		str,
		'(https?:\\/\\/(?:www\\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\\.[^\\s]{2,}|www\\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\\.[^\\s]{2,}|https?:\\/\\/(?:www\\.|(?!www))[a-zA-Z0-9]\\.[^\\s]{2,}|www\\.[a-zA-Z0-9]\\.[^\\s]{2,})',		
		config
	)
}

function stateRegex(str, config) {
	return regexParser(
		str,
		'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New[ ]Hampshire|New[ ]Jersey|New[ ]Mexico|New[ ]York|North[ ]Carolina|North[ ]Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode[ ]Island|South[ ]Carolina|South[ ]Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West[ ]Virginia|Wisconsin|Wyoming',
		config);
}

function stateAbbrRegex(str,config) {
	return regexParser(
		str,
		'\\b,[ ]?[A-Z]{2}\\b',
		config);
}

function cityRegex(str,config) {
	return regexParser(
		str,
		'\\b[a-zA-Z]+([ A-Za-z]){0,12},[ ]+(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New[ ]Hampshire|New[ ]Jersey|New[ ]Mexico|New[ ]York|North[ ]Carolina|North[ ]Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode[ ]Island|South[ ]Carolina|South[ ]Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West[ ]Virginia|Wisconsin|Wyoming)',
		config);
}

function cityAbbrRegex(str,config) {
	return regexParser(
		str,
		'\\b[a-zA-Z]+([ A-Za-z]){0,12},[ ]+([A-Z]{2})\\b',
		config);
}

function streetRegex(str,config) {
	return regexParser(
		str,
		'\\d+[ ](?:[A-Za-z0-9.-]+[ ]?)+(?:Avenue|Lane|Road|Boulevard|Drive|Street|Ave|Dr|Rd|Blvd|Ln|St)\\.?',
		config);
}

function zipCodeRegex(str,config) {
	return regexParser(
		str,
		'\\b\\d{5}(?:-\\d{4})?\\b',
		config);
}

function regexParser(str, pattern, config) {

	if (!str && typeof str !== 'string')
		throw new TypeError('The first argument is not a string. Please provide a string value.');

	if (!pattern && typeof pattern !== 'string')
		throw new TypeError('The second argument is not a string. Please provide a string value.');

	let flags = ['g'];

	if (config && config.constructor == Object) {
		let { matchAll, ignoreCase, multiLine, matchUnicode, stickyMatch } = config;
		
		if (matchAll === false)    flags.splice(0, 1);
		if (ignoreCase === true)   flags.push('i');
		if (multiLine === true)    flags.push('m');
		if (matchUnicode === true) flags.push('u');
		if (stickyMatch === true)  flags.push('y');
	}
	let result = str.match( new RegExp(pattern, flags.join('') || '') );
	return (result) ? result : [];
}

// console.log(getCityState('Contact Us Founded in 1954 by Howard and Naomi Taylor, Douglass has been supplying high design, quality fabrics to the industry for over sixty years. Located in Egg Harbor City, New Jersey, decades of devotion to textile manufacturing have earned Douglass a reputation for discriminating style, quick delivery, and excellent customer service. Our extensive sales force, both domestically and abroad, ensure there is someone available to address your special fabric needs. Douglass provides contract seating fabrics, panel fabrics, faux vinyls / urethanes, and foam to a broad spectrum of markets including contract purchasers, interior designers, furniture manufacturers, architects, and specifiers along with federal and state governments. Please browse our website for additional information on our products, or to request memo samples. CONTACT US: Douglass Industries, Inc. 412 Boston Ave P.O. Box 701 Egg Harbor City, NJ  08215 Phone:  609-965-6030 E-Mail:  info@dougind.com Customer Service Phone:  800-950-3684 Fax:  609-965-7271 E-Mail: sales@dougind.com samples@dougind.com Monday – Friday 8:00am to 6pm E.S.T.'));

// console.log(getCityState('asad Egg Harbor City, NJ'));
// console.log(getCityState('Miami, FL'));

// scrape('endurance-crawl-bags','96,http://acecwatertown.org/');
// scrape('endurance-crawl-bags','97,https://www.danitadelimont.com/');
// scrape('','98,http://dougind.com');

// console.log(urlRegex('contact.php',{}));

do {
	for (let i = 0; i <= 10000; i++) {
		processQueueMessage(
			'https://sqs.us-west-2.amazonaws.com/088617881078/backlog_crawlBot',
			'endurance-crawl-bags');
	}	
	sleep(5000);
 } while (true);

// var lineReader = require('readline').createInterface({
// 	input: fs.createReadStream('/Users/jchaves/Downloads/urlListWithAdWords/Urls.txt')
// });

// let countLine = 0;


// lineReader.on('line', function (line) {		

// 	var params = {
// 		DelaySeconds: 0,
// 		MessageAttributes: {},
// 		MessageBody: countLine + ','+ line,
// 		QueueUrl: "https://sqs.us-west-2.amazonaws.com/088617881078/backlog_crawlBot"
// 	   };

// 	   if(countLine >= 1 && countLine<= 10000){
// 		sqs.sendMessage(params, function(err, data) {
// 			if (err) {
// 			  console.log("Error", err);
// 			} else {
// 			  console.log("Success", data.MessageId);
// 			}
// 		  });
// 		console.log('Line from file:', line);
// 	   }	
// 	countLine+=1;
//   });