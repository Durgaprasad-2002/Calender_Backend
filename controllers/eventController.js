const Event = require("../models/Event");
const User = require("../models/User");
const { google } = require("googleapis");
const { oauth2Client } = require("../config/google");

const createGoogleCalendarEvent = async (event, user) => {
  console.log("user :" + JSON.stringify(user));
  if (!user.tokens) {
    throw new Error("No access token available in user tokens.");
  }

  oauth2Client.setCredentials({ access_token: user.tokens.access_token });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const googleEvent = {
    summary: event.title,
    description: event.description,
    start: {
      dateTime: new Date(event.date).toISOString(),
      timeZone: "UTC",
    },
    end: {
      dateTime: new Date(
        new Date(event.date).getTime() + event.duration * 60 * 60 * 1000
      ).toISOString(),
      timeZone: "UTC",
    },
    attendees: event.participants.map((email) => ({ email })),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  console.log("entered 3");

  calendar.events.insert(
    {
      auth: oauth2Client,
      calendarId: "primary",
      resource: googleEvent,
    },
    function (err, event) {
      if (err) {
        console.log(
          "There was an error contacting the Calendar service: " + err
        );
        return;
      }
      console.log(event);
      console.log("Event created: %s", event.data);
    }
  );

  let data = 1;

  console.log("event id" + data);
  console.log("entered 4");

  return data;
};

exports.createEvent = async (req, res) => {
  try {
    const event = req.body.event;
    const user = req.body.user;
    console.log("Strind data:" + JSON.stringify(req.body));

    const newEvent = new Event(event);

    let foundUser = await User.findOne({ email: user.email });

    if (!foundUser) {
      foundUser = new User({
        googleId: user.userId,
        email: user.email,
        tokens: user.tokens,
      });
      await foundUser.save();
    }

    console.log("Founded user: " + foundUser);

    // console.log(event, "-----", user);

    newEvent.userId = foundUser._id;

    const googleEventId = await createGoogleCalendarEvent(newEvent, user);

    newEvent.googleEventId = googleEventId;
    console.log("entered 2");
    await newEvent.save();

    res.status(201).json(newEvent);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};

exports.getEventsByUserAndDate = async (req, res) => {
  try {
    const { userId, date } = req.params;
    const events = await Event.find({ userId, date: new Date(date) });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const { event, user } = req.body;

    const updatedEvent = await Event.findByIdAndUpdate(eventId, event, {
      new: true,
    });

    let foundUser = await User.findById(user.userId);
    if (!foundUser) {
      foundUser = new User({
        _id: user.userId,
        email: user.email,
        tokens: user.tokens,
      });
      await foundUser.save();
    }

    oauth2Client.setCredentials(foundUser.tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const googleEvent = {
      summary: updatedEvent.title,
      description: updatedEvent.description,
      start: {
        dateTime: new Date(updatedEvent.date).toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: new Date(
          new Date(updatedEvent.date).getTime() +
            updatedEvent.duration * 60 * 60 * 1000
        ).toISOString(),
        timeZone: "UTC",
      },
      attendees: updatedEvent.participants.map((email) => ({ email })),
    };

    await calendar.events.update({
      calendarId: "primary",
      eventId: updatedEvent.googleEventId,
      resource: googleEvent,
    });

    res.json(updatedEvent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await Event.findByIdAndDelete(eventId);

    const foundUser = await User.findById(event.userId);
    oauth2Client.setCredentials(foundUser.tokens);

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    await calendar.events.delete({
      calendarId: "primary",
      eventId: event.googleEventId,
    });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
