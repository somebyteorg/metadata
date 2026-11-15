'use strict'

import 'dotenv/config'
import Hapi from '@hapi/hapi'
import HapiInert from '@hapi/inert'
import joi from 'joi'
import { spawn } from 'node:child_process'
import JSONStream from 'JSONStream'
import bl from 'bl'
import Path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { FFProbeStream } from 'ffprobe'
import {
  parseFromTokenizer,
  selectCover,
  type IAudioMetadata,
} from 'music-metadata'
import { makeTokenizer } from '@tokenizer/http'
import { fromFile } from 'strtok3'
import dayjs from 'dayjs'

const TMP_PATH = Path.join(process.cwd(), 'tmp')
const STORAGE_PATH = process.env.STORAGE_PATH || TMP_PATH

const CRYPTO_SUPPORTED = crypto.getHashes()

const init = async () => {
  if (STORAGE_PATH === TMP_PATH) {
    await fs.promises.mkdir(TMP_PATH, { recursive: true })
    for (const file of await fs.promises.readdir(TMP_PATH, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (file.isFile()) {
        await fs.promises.rm(Path.join(file.parentPath, file.name), { force: true })
      }
    }
  }

  const server = Hapi.server({
    host: process.env.SERVER_HOST,
    port: process.env.SERVER_PORT,
    debug: {
      log: ['*'],
      request: ['*'],
    },
    routes: {
      files: {
        relativeTo: STORAGE_PATH,
      },
    },
  })

  await server.register(HapiInert)

  server.route({
    method: 'get',
    path: '/',
    handler: (request, h) => {
      return h.response({
        name: process.env.APP_NAME,
        time: new Date(),
      })
    },
  })

  server.route({
    method: 'post',
    path: '/ffprobe',
    options: {
      validate: {
        payload: joi.object({
          url: joi.string().required(),
        }),
      },
    },
    handler: async (request, h) => {
      try {
        // https://github.com/eugeneware/ffprobe/blob/master/index.js
        let info: {
          streams: FFProbeStream[]
          chapters: {
            id: number
            time_base: string
            start: number
            start_time: string
            end: number
            end_time: string
            tags?: Record<string, string>
          }[]
          format: {
            filename: string
            duration: string
            size: string
            bit_rate: string
            tags: {
              title?: string
              creation_time: string
            }
          }
        } = await new Promise((resolve, reject) => {
          let stdout: any, stderr: any

          let ffprobe = spawn(process.env.FFPROBE_PATH, [
            // prettier-ignore
            '-show_format',
            '-show_streams',
            '-show_chapters',
            '-print_format',
            'json',
            (request.payload as any).url,
          ])

          ffprobe.once('close', function (code) {
            if (!code) {
              resolve(stdout)
            } else {
              let err = stderr.split('\n').filter(Boolean).pop()
              reject(new Error(err))
            }
          })

          ffprobe.stderr.pipe(
            bl(function (err, data) {
              stderr = data.toString()
            }),
          )

          ffprobe.stdout.pipe(JSONStream.parse()).once('data', (row: any) => {
            stdout = row
          })
        })

        // @ts-ignore
        delete info.format.filename

        return h.response(info)
      } catch (e) {
        let error = `ffprobe error ${e}`
        request.log('error', error)
        return h.response(error).code(500)
      }
    },
  })

  server.route({
    method: 'post',
    path: '/music/parse',
    options: {
      validate: {
        payload: joi.object({
          url: joi.string().required(),
        }),
      },
    },
    handler: async (request, h) => {
      try {
        const { url } = request.payload as { url: string }
        let metadata: IAudioMetadata

        if (Path.isAbsolute(url)) {
          const token = await fromFile(url)
          try {
            // Omit format hints so the parser detects the format from file contents.
            delete token.fileInfo.path
            delete token.fileInfo.mimeType
            metadata = await parseFromTokenizer(token, { duration: true })
          } finally {
            await token.close()
          }
        } else {
          const token = await makeTokenizer(url)
          try {
            metadata = await parseFromTokenizer(token)
          } finally {
            await token.close()
          }
        }

        let common = metadata.common

        let cover = selectCover(common.picture),
          cover_path = null
        if (cover) {
          // 这么切应该没问题
          let cover_name = `${crypto.randomUUID().replace(/-/g, '')}.${cover.format.split('/')[1]}`,
            cover_path_date = dayjs().format('YYYY/MM/DD'),
            cover_path_base = `${STORAGE_PATH}/${cover_path_date}`

          await fs.promises.mkdir(cover_path_base, {
            recursive: true,
          })

          let file_path = `${cover_path_base}/${cover_name}`
          cover_path = `${cover_path_date}/${cover_name}`

          await fs.promises.writeFile(file_path, cover.data)

          if (STORAGE_PATH === TMP_PATH) {
            setTimeout(() => {
              fs.promises.rm(file_path, { force: true }).catch(console.error)
            }, 120 * 1000).unref()
          }
        }

        delete common.picture

        return h.response({
          cover_path: cover ? `/storage/${cover_path}` : null,
          format: metadata.format,
          ...common,
        })
      } catch (e) {
        let error = `music error ${e}`
        request.log('error', error)
        return h.response(error).code(500)
      }
    },
  })

  server.route({
    method: 'get',
    path: '/storage/{path*}',
    options: {},
    handler: {
      file: (request) => {
        console.log(request.params.path)
        return request.params.path
      },
    },
  })

  server.route({
    method: 'post',
    path: '/hash',
    options: {
      validate: {
        payload: joi.object({
          algorithm: joi
            .string()
            .insensitive()
            .valid(...CRYPTO_SUPPORTED)
            .required(),
          path: joi.string().required(),
        }),
      },
    },
    handler: async (request, h) => {
      let payload = request.payload as any
      return new Promise((resolve) => {
        let hash = crypto.createHash(payload.algorithm),
          stream = fs.createReadStream(payload.path)
        stream.on('data', (chunk) => hash.update(chunk))
        stream.on('end', () =>
          resolve(
            h
              .response({
                hash: hash.digest('hex'),
              })
              .code(200),
          ),
        )
        stream.on('error', (err) => resolve(h.response(err.toString()).code(500)))
      })
    },
  })

  await server.start()
  console.log('server running on %s', server.info.uri)
}

process.on('unhandledRejection', (err) => {
  console.log(err)
  process.exit(1)
})

init()
