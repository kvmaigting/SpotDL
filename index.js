import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import querystring from "querystring";
import crypto from "crypto";
import cors from "cors";
import cookieParser from "cookie-parser";
import request from "request";
import ytdlp from "yt-dlp";
import {Downloader} from "ytdl-mp3";


const app = express();
const port = 3000;

app.use(express.static("public"))
    .use(cors())
    .use(cookieParser());

app.use(bodyParser.urlencoded({ extended: true }));

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
});

//Initiate authorization request
var client_id = 'bb40505f72fb4894b4aa59539529546d';
var client_secret = '7573234dd4a44a9cbee57a69bbe2edea';
var redirect_uri = 'http://localhost:3000/callback';

//Spotify API
const generateRandomString = (length) => {
    return crypto
    .randomBytes(60)
    .toString('hex')
    .slice(0, length);
  }

var stateKey = 'spotify_auth_state';

app.get('/', function(req, res) {
    var state = generateRandomString(16);
    res.cookie(stateKey, state);
  
    // application requests authorization
    var scope = 'user-read-private user-read-email';
    res.redirect('https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state
      }));
});

var yourBearerToken;
app.get('/callback', function(req, res) {
  
    // application requests refresh and access tokens
    // after checking the state parameter
  
    var code = req.query.code || null;
    var state = req.query.state || null;
    var storedState = req.cookies ? req.cookies[stateKey] : null;
  
    if (state === null || state !== storedState) {
      res.redirect('/#' +
        querystring.stringify({
          error: 'state_mismatch'
        }));
    } else {
      res.clearCookie(stateKey);
      var authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        form: {
          code: code,
          redirect_uri: redirect_uri,
          grant_type: 'authorization_code'
        },
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + (new Buffer.from(client_id + ':' + client_secret).toString('base64'))
        },
        json: true
      };
  
      request.post(authOptions, function(error, response, body) {
        if (!error && response.statusCode === 200) {
  
          var access_token = body.access_token,
              refresh_token = body.refresh_token;
  
          var options = {
            url: 'https://api.spotify.com/v1/me',
            headers: { 'Authorization': 'Bearer ' + access_token },
            json: true
          };

          //saving access_token
          yourBearerToken = access_token;
  
          // use the access token to access the Spotify Web API
          request.get(options, function(error, response, body) {
            console.log("Successful authentication");
          });
  
          // redirects to /home
          res.redirect('/home');
        } else {
          res.redirect('/#' +
            querystring.stringify({
              error: 'invalid_token'
            }));
        }
      });
    }
  });

app.get('/home', function(req, res) {
    res.render("index.ejs");
});


var playlistId;
app.post("/get-url", (req, res) => {

  const playlistURL = req.body["pURL"];
    try {
        if(isValidURL(playlistURL)) {
          const urlSplit = playlistURL.split('/');
          playlistId = urlSplit[4].substring(0,22);
          console.log("playlist Input: " + playlistId);
          res.redirect("/get-playlist")
        } else {
          throw "Invalid URL."
        }
    } catch (error) {
        console.error(error);
    }
});

function isValidURL(url) {
  try {
    let truncatedURL = url.substring(0,34);
    console.log("truncated URL:" + truncatedURL);
    if (truncatedURL == "https://open.spotify.com/playlist/") {
      return true;
    } else {
      return false;
    }
  } catch(err) {
    return false;
  }
}



const song = {
    songName: "",
    artists: "",
    album: ""};

function Song(songName, artists, album) {
    this.songName = songName;
    this.artists = artists;
    this.album = album;
  }

// list of songs that will be posted on the website
var playlist = [song];

//youtube song URL array
var songURL = [];

  app.get("/get-playlist", async (req, res) => {
    //emptying playlist array
    playlist.length = 0;
    
    try {
        const response = await axios.get('https://api.spotify.com/v1/playlists/' + playlistId + '/tracks?fields=items%28track%28name%2Calbum%28name%29%2Cartists%28name%29%29%29', 
        { headers: { Authorization: 'Bearer ' + yourBearerToken} });
        
        var item = response.data.items;
        try {
            for(var key in item) {
                if (item.hasOwnProperty(key)) {
                    var val = item[key];
                    
                    //adding Song in the playlist array
                    playlist.push(new Song(val.track.name, val.track.artists[0].name, val.track.album.name));

                    //fetching youtube links
                    var searchOption = {query: val.track.name + " - " + val.track.artists[0].name};
                    console.log("query song: " + JSON.stringify(searchOption));
                    
                    const rsp = await ytdlp.info.searchYT(searchOption).then((rsp) => {
                        songURL.push(rsp[0].link);
                      }).catch((error)=> {
                        console.log(error);
                      });
                  }
            }
            //rendering download page and passing playlist array
            res.render("downloadPage.ejs", {
                playlist: playlist
            });
        } catch (err) {
            console.log("invalid array" + err);
        }
    } catch (error) {
        console.error(error);
    }
  });

  app.get('/download', async (req, res) => {
    
    const downloader = new Downloader({
        getTags: true
      });
      for(let i = 0; i < songURL.length; i++) {
        try {
          console.log(songURL[i]);
          await downloader.downloadSong(songURL[i]);
        } catch(error) {
          console.error("Song metadata cannot be found, song download skipped.");
        }
      }
      console.log("Download Playlist Complete!")
      res.redirect("/home");   
  });

  
  
 


