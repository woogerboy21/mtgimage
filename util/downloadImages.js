"use strict";
/*global setImmediate: true*/

var base = require("xbase"),
	C = require("C"),
	fs = require("fs"),
	url = require("url"),
	moment = require("moment"),
	runUtil = require("xutil").run,
	httpUtil = require("xutil").http,
	imageUtil = require("xutil").image,
	unicodeUtil = require("xutil").unicode,
	path = require("path"),
	querystring = require("querystring"),
	tiptoe = require("tiptoe");

var JSON_PATH = "/mnt/compendium/DevLab/mtgjson/json";
var IMAGES_PATH = "/mnt/compendium/DevLab/mtgimage/web/actual/set";

function usage()
{
	base.error("Usage: node %s <set code or name>", process.argv[1]);
	process.exit(1);
}

if(process.argv.length<3)
	usage();

var targetSet = C.SETS.mutateOnce(function(SET) { if(SET.name.toLowerCase()===process.argv[2].toLowerCase() || SET.code.toLowerCase()===process.argv[2].toLowerCase()) { return SET; } });
if(!targetSet)
{
	base.error("Set %s not found!", process.argv[2]);
	process.exit(1);
}

tiptoe(
	function rip()
	{
		downloadImages(targetSet.code, this);
	},
	function finish(err)
	{
		if(err)
		{
			base.error(err);
			process.exit(1);
		}

		process.exit(0);
});

function downloadImages(setCode, cb)
{
	if(!fs.existsSync(path.join(IMAGES_PATH, setCode.toLowerCase())))
		fs.mkdirSync(path.join(IMAGES_PATH, setCode.toLowerCase()));
	else
		base.warn("Set images directory (%s) already exists!", setCode.toLowerCase());

	tiptoe(
		function loadJSON()
		{
			fs.readFile(path.join(JSON_PATH, setCode + ".json"), {encoding : "utf8"}, this);
		},
		function processCards(err, setJSON)
		{
			if(err)
			{
				setImmediate(function() { cb(err); });
				return;
			}

			var set = JSON.parse(setJSON);
			set.cards.serialForEach(function(card, subcb)
			{
				var targetImagePath = path.join(IMAGES_PATH, setCode.toLowerCase(), card.imageName + ".jpg");

				tiptoe(
					function downloadImage()
					{
						if(fs.existsSync(targetImagePath))
						{
							base.warn("Image already exists, skipping: %s", targetImagePath);
							setImmediate(subcb);
							this.exit();
							return;
						}

						var imageURL = null;
						if(set.isMCISet)
						{
							imageURL = url.format(
							{
								protocol : "http",
								host     : "magiccards.info",
								pathname : "/scans/en/" + set.magicCardsInfoCode.toLowerCase() + "/" + card.number + ".jpg"
							});
						}
						else
						{
							imageURL = url.format(
							{
								protocol : "http",
								host     : "gatherer.wizards.com",
								pathname : "/Handlers/Image.ashx",
								query    :
								{
									multiverseid : card.multiverseid,
									type         : "card"
								}
							});
						}

						base.info("Downloading image for card: %s (from %s)", card.name, imageURL);

						httpUtil.download(imageURL, targetImagePath, this);
					},
					function checkFileType()
					{
						base.info("Processing: " + targetImagePath);
						runUtil.run("file", ["-b", targetImagePath], {silent : true}, this);
					},
					function convertToJPGIfNeeded(type)
					{
						if(type.toLowerCase().trim().startsWith("png "))
						{
							fs.renameSync(targetImagePath, targetImagePath.replaceAll(".jpg", ".png"));
							runUtil.run("convert", [targetImagePath.replaceAll(".jpg", ".png"), "-quality", "100", targetImagePath], {silent : true}, this);
						}
						else
						{
							this();
						}
					},
					function removePNGFiles()
					{
						if(fs.existsSync(targetImagePath.replaceAll(".jpg", ".png")))
							fs.unlink(targetImagePath.replaceAll(".jpg", ".png"), this);
						else
							this();
					},
					function getSize()
					{
						imageUtil.getWidthHeight(targetImagePath, this);
					},
					function makeCrop(size)
					{
						var cropSize = (set.isMCISet ? "276x203+18+45" : (size[0]===265 ? "223x163+21+42" : "182x134+20+37"));
						runUtil.run("convert", [targetImagePath, "-crop", cropSize, targetImagePath.replaceAll(".jpg", ".crop.jpg")], {silent:true}, this);
					},
					function compressImages()
					{
						runUtil.run("node", [path.join(__dirname, "compressImages.js"), targetImagePath], {silent:true}, this.parallel());
						runUtil.run("node", [path.join(__dirname, "compressImages.js"), targetImagePath.replaceAll(".jpg", ".crop.jpg")], {silent:true}, this.parallel());
					},
					function finish(err)
					{
						setImmediate(function() { subcb(err); });
					}
				);
			}, function() { setTimeout(cb, base.SECOND*4); });
		}
	);
	
}
