# metadata

适用于 [`emya`](https://github.com/emosp/emya) 的媒体信息抓取

# 安装

## pm2

### 所需扩展

- `ffprobe` 扫码视频信息用到

### 使用

```bash
pnpm install
pnpm run build
pm2 start
```

## docker

`docker build . -t emospg/metadata`

```bash
docker compose up -d
```

# Api

## `ffprobe`

```bash
curl --location '127.0.0.1:8000/ffprobe' --header 'Content-Type: application/json' --data '{
    "url": "[file_url]"
}'
```

## `music`

### `parse`

```bash
curl --location '127.0.0.1:8000/music/parse' --header 'Content-Type: application/json' --data '{
    "url": "[music_url]"
}'
```

```josn
{
  "cover_path": "/music/cover/c8567c7f6840464cb0eb25ba288a8f3a.jpeg",
  "format": {
    "tagTypes": [
      "ID3v2.3"
    ],
    "trackInfo": [],
    "lossless": false,
    "hasAudio": true,
    "hasVideo": false,
    "container": "MPEG",
    "codec": "MPEG 1 Layer 3",
    "sampleRate": 44100,
    "numberOfChannels": 2,
    "bitrate": 320000,
    "codecProfile": "CBR",
    "duration": 188.316734693878,
    "tool": "LAME 3.99.5",
    "numberOfSamples": 8304768
  },
  "track": {
    "no": null,
    "of": null
  },
  "disk": {
    "no": null,
    "of": null
  },
  "movementIndex": {
    "no": null,
    "of": null
  },
  "encodersettings": "Lavf56.4.101",
  "comment": [
    {
      "language": "XXX",
      "descriptor": "",
      "text": "text"
    }
  ],
  "album": "xxxx",
  "title": "xxxx",
  "artists": [
    "xxxxx"
  ],
  "artist": "xxxxx",
  "albumartists": [
    "xxxxx"
  ],
  "albumartist": "xxxxx"
}
```

### `cover`

- 生成 `120s` 后系统会自动删除

`http://127.0.0.1:8000/music/parse/[cover_path]`

