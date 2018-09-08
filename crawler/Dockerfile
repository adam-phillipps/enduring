FROM node:8.10

ENV 			NODE_ENV 	production
ENV 			FNAME 		/home/node/results/bot.results
ENV 			LNAME 		/home/node/logs/bot.log

RUN 			mkdir -p /home/node/app/ \
					/home/node/results \
					/home/node/logs \
				&& touch /home/node/logs/bot.log \
					/home/node/results/bot.results
VOLUME ./:/home/node/app/
COPY ./ 		/home/node/app/
WORKDIR 		/home/node/app/

# ENTRYPOINT 	["node", "index.js"]
ENTRYPOINT ["/bin/bash"]
