'use strict'

const path      = require( 'path' )
// electron on heroku
// https://medium.com/@johann.pardanaud/running-electron-on-heroku-db3866a690a3
// https://github.com/benschwarz/heroku-electron-buildpack
// nightmareJS will support headless browser
// https://github.com/electron/electron/issues/228#issuecomment-310627674
const Nightmare = require( 'nightmare' )
// export DEBUG=nightmare* && node bin/create-thumbs.js

const templateFolder  = path.resolve( __dirname, '../templates/sub-themes' )
const blockNames      = [ '_full' ]

// renderWidth: 680,
// outputWidth: 340

function createWindow(show = false) {
  return Nightmare({
    show,
    useContentSize: true
  })
  .viewport(680, 780)
}


const nightmare = createWindow()

nightmare
.goto( `file://${ templateFolder }/template-sub-themes.html` )
.wait( `body` )
.evaluate( () => {
  return {
    width:  Math.round( document.body.scrollWidth ),
    height: Math.round( document.body.scrollHeight ),
  }
})
.then( ({width, height}) => {
  return nightmare.viewport(width, height)
})
.then( () => {
  return nightmare
  .evaluate( () => {
    // this is to hide scrollars for screenshots
    // https://github.com/segmentio/nightmare/issues/726#issuecomment-232851174
    var s = document.styleSheets[0]
    s.insertRule('::-webkit-scrollbar { display:none; }')
    // get position of every blocks
    const nodes   = [ ...document.querySelectorAll('[data-ko-container] [data-ko-block]') ]
    const blocks  = nodes.map( node => {
      const name  = node.getAttribute('data-ko-block')
      const rect  = node.getBoundingClientRect()
      return {
        name,
        // electron only support integers
        // https://github.com/electron/electron/blob/master/docs/api/structures/rectangle.md
        clip: {
          x:      Math.round( rect.left ),
          y:      Math.round( rect.top ),
          width:  Math.round( rect.width ),
          height: Math.round( rect.height ),
        }
      }
    })
    // add the global view
    blocks.push({
      name: '_full',
      clip: {
        x:      0,
        y:      0,
        width:  Math.round( document.body.scrollWidth ),
        height: Math.round( document.body.scrollHeight ),
      }
    })
    return { blocks }
  })
} )
.then( ({ blocks }) => {
  console.log( blocks )
  const screens = blocks.map( ({name, clip}) => {
    return nightmare
    // need those scrolls to trigger a new render ¬_¬'
    .scrollTo(1, 1)
    .scrollTo(0, 0)
    .screenshot( `${ templateFolder }/pouic/${name}.png`, clip )
  })
  return Promise.all( screens )
})
.then( () => {
  console.log( 'all done' )
  process.exit( 0 )
} )
.catch( e => {
  console.log( e )
  nightmare.end()
  process.exit( 1 )
})
