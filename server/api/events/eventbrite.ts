import eventSourcesJSON from 'public/event_sources.json';
import { JSDOM } from 'jsdom';

// export default defineCachedEventHandler(async (event) => {
export default defineEventHandler(async (event) => {
	const body = await fetchEventbriteEvents();
	return {
		body
	}
}, {
	maxAge: 3600,
});

async function fetchEventbriteEvents() {
	const eventbriteSources = await Promise.all(
		eventSourcesJSON.eventbrite.map(async (source) => {
			return await fetch(source.url)
				.then(res => res.text())
				.then(html => {
					const dom = new JSDOM(html);
					const eventsRaw = JSON.parse(dom.window.document.querySelectorAll('script[type="application/ld+json"]')[1].innerHTML).map(convertSchemaDotOrgEventToFullCalendarEvent);
					// Since public & private Eventbrite endpoints provides a series of events as a single event, we need to split them up using their API.
					let events = new Array();
					eventsRaw.forEach(async (event) => {
						const isLongerThan3Days = (event.end.getTime() - event.start.getTime()) / (1000 * 3600 * 24) > 3;
						if (isLongerThan3Days) {
							const eventSeries = (await getEventSeries(event.url));
							eventSeries.forEach(event => {
								events.push(convertEventbriteAPIEventToFullCalendarEvent(event));
							});
						} else {
							events.push(event);
						}
					});
					console.log(events);

					return {
						events,
						city: source.city
					} as EventNormalSource;
				});
		}))
	return eventbriteSources;
};

async function getEventSeries(event_url: string) {
	// Split URL by '-' and get the last part.
	const series_id = event_url.split('-').pop();
	const res = await fetch(`https://www.eventbriteapi.com/v3/series/${series_id}/events/?token=${process.env.EVENTBRITE_API_KEY}`)
		.then((res) => {
			return res.json();
		});
	// Sometimes the response returns 404 for whatever reason. I imagine for events with information set to private. Ignore those.
	return res.events || [];
}

function convertSchemaDotOrgEventToFullCalendarEvent(item) {
	// If we have a `geo` object, format it to geoJSON.
	var geoJSON = (item.location.geo) ? {
		type: "Point",
		coordinates: [
			item.location.geo.longitude,
			item.location.geo.latitude
		]
		// Otherwise, set it to null.
	} : null;

	return {
		title: item.name,
		start: new Date(item.startDate),
		end: new Date(item.endDate),
		url: item.url,
		extendedProps: {
			description: item.description || null,
			image: item.image,
			location: {
				geoJSON: geoJSON,
				eventVenue: {
					name: item.location.name,
					address: {
						streetAddress: item.location.streetAddress,
						addressLocality: item.location.addressLocality,
						addressRegion: item.location.addressRegion,
						postalCode: item.location.postalCode,
						addressCountry: item.location.addressCountry
					},
					geo: item.location?.geo
				}
			}
		}
	};
};

// The problem with the Eventbrite developer API format is that it lacks geolocation.
function convertEventbriteAPIEventToFullCalendarEvent(item) {
	return {
		title: item.name.text,
		start: new Date(item.start.local),
		end: new Date(item.end.local),
		url: item.url,
	};
};
