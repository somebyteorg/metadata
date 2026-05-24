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
import { FFProbeStream } from 'ffprobe'
import { parseFromTokenizer, selectCover } from 'music-metadata'
import { makeTokenizer } from '@tokenizer/http'

const TMP_PATH = Path.join(process.cwd(), 'tmp')

const init = async () => {
  const server = Hapi.server({
    host: process.env.SERVER_HOST,
    port: process.env.SERVER_PORT,
    debug: {
      log: ['*'],
      request: ['*'],
    },
    routes: {
      files: {
        relativeTo: TMP_PATH,
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
        let token = await makeTokenizer((request.payload as any).url),
          metadata = await parseFromTokenizer(token),
          common = metadata.common

        let cover = selectCover(common.picture),
          cover_path = null
        if (cover) {
          // 这么切应该没问题
          cover_path = `${crypto.randomUUID().replace(/-/g, '')}.${cover.format.split('/')[1]}`

          let file_path = `${TMP_PATH}/${cover_path}`

          fs.writeFileSync(file_path, cover.data)

          setTimeout(() => {
            try {
              fs.unlinkSync(file_path)
            } catch (e) {}
          }, 120 * 1000)
        }

        delete common.picture

        return h.response({
          cover_path: cover ? `/music/cover/${cover_path}` : null,
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
    path: '/music/cover/{filename}',
    options: {},
    handler: {
      file: (request) => {
        return request.params.filename
      },
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
