const reqPromise = require('request-promise');
const cheerio = require('cheerio');
const fs = require('fs');
const urls = ['http://Karmabb.com'];
let bag;

function parameterizeURL(url) {
	return {
		uri: url,
		transform: (body) => {
			return cheerio.load(body);
		}
	};
}

function sleep (time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

let opts = parameterizeURL(urls[0]);
let link = reqPromise(opts)
	.then(($) => {
		console.log("FIRST");
		console.log($);
		return $('a:contains("CONTACT")').attr('href');
	})
	.then((lnkAddr) => {
		console.log("SECOND");
		console.log(lnkAddr);

		reqPromise(parameterizeURL(lnkAddr))
			.then((lnkPage) => {
				console.log("Third");
				// console.log(lnkPage);
				let textBody = lnkPage.text().trim()
					.replace(/&nbsp;/g, '')
					.replace(/<[^\/>][^>]*><\/[^>]+>/g, "");
				console.log(textBody);
				return textBody;
			})
			.catch((err) => { console.log("Error: " + err) });
		// return lnkAddr;
	})
	.catch((err) => { console.log("Error: " + err) });
