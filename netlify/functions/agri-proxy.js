const http = require('node:http')

exports.handler = async (event) => {
  const qs = new URLSearchParams(event.queryStringParameters ?? {}).toString()
  const url = `http://psis.rda.go.kr/openApi/service.do?${qs}`

  const body = await new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    }).on('error', reject)
  })

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
    body,
  }
}
