const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const {format} = require('date-fns')

app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const selectUserQuery = `
    select * from user
    where username = '${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser !== undefined) {
    return response.status(400).send('User already exists')
  } else {
    if (password.length < 6) {
      return response.status(400).send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const addUserQuery = `
        insert into user (username, password, name, gender)
        values ('${username}', '${hashedPassword}', '${name}', '${gender}')
      `
      await db.run(addUserQuery)
      return response.status(200).send('User created successfully')
    }
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const selectUserQuery = `
    select * from user
    where username = '${username}'
  `
  const dbUser = await db.get(selectUserQuery)
  if (dbUser === undefined) {
    return response.status(400).send('Invalid user')
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password)
    if (isPasswordCorrect === false) {
      return response.status(400).send('Invalid password')
    } else {
      const payload = {
        username: username,
      }
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    }
  }
})

const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET_KEY', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)
  console.log(user)
  const followerIdQuery = `
      SELECT following_user_id FROM
      follower WHERE follower_user_id = '${user.user_id}'
    `
  const followerIds = await db.all(followerIdQuery)

  const followingsArray = followerIds.map(
    follower => follower.following_user_id,
  )
  if (followingsArray.length === 0) {
    return response.status(200).send([])
  }

  const getTweetsQuery = `
      SELECT distinct user.username, tweet.tweet, tweet.date_time as dateTeime
      FROM tweet INNER JOIN user
      ON tweet.user_id = user.user_id
      WHERE tweet.user_id IN (${followingsArray.join(',')})
      ORDER BY tweet.date_time DESC
      LIMIT 4
    `
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)

  const followerIdQuery = `
      SELECT following_user_id FROM 
      follower WHERE follower_user_id = '${user.user_id}'
    `
  const followerIds = await db.all(followerIdQuery)

  const followingsArray = followerIds.map(
    follower => follower.following_user_id,
  )
  if (followingsArray.length === 0) {
    return response.status(200).send([])
  }

  const getFollowingNamesQuery = `
      SELECT distinct user.name
      FROM tweet INNER JOIN user
      ON tweet.user_id = user.user_id
      WHERE tweet.user_id IN (${followingsArray.join(',')})
    `
  const names = await db.all(getFollowingNamesQuery)
  response.send(names)
})

app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)

  const followerIdQuery = `
      SELECT follower_user_id FROM 
      follower WHERE following_user_id = '${user.user_id}'
    `
  const followerIds = await db.all(followerIdQuery)
  console.log(followerIds)
  const followingsArray = followerIds.map(follower => follower.follower_user_id)
  if (followingsArray.length === 0) {
    return response.status(200).send([])
  }

  const getFollowingNamesQuery = `
      SELECT distinct name
      FROM user
      WHERE user_id IN (${followingsArray.join(',')})
    `
  const names = await db.all(getFollowingNamesQuery)
  response.send(names)
})

app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)

  const followerIdQuery = `
      SELECT following_user_id FROM 
      follower WHERE follower_user_id = '${user.user_id}'
    `
  const followerIds = await db.all(followerIdQuery)

  const followingsArray = followerIds.map(
    follower => follower.following_user_id,
  )
  if (followingsArray.length === 0) {
    return response.status(200).send([])
  }

  const getTweetDetailQuery = `
    SELECT user_id FROM tweet 
    WHERE tweet_id = '${tweetId}'`
  const tweet = await db.get(getTweetDetailQuery)
  const {user_id} = tweet

  console.log(followingsArray.includes(user_id))

  if (!followingsArray.includes(user_id)) {
    return response.status(401).send('Invalid Request')
  } else {
    const getTweetDetailsQuery = `
      SELECT tweet, 
             (SELECT COUNT(*) FROM like WHERE tweet_id = '${tweetId}') AS likes,
             (SELECT COUNT(*) FROM reply WHERE tweet_id = '${tweetId}') AS replies,
             date_time AS dateTime 
      FROM tweet 
        WHERE tweet_id = '${tweetId}'`
    const tweet = await db.all(getTweetDetailsQuery)
    response.send(tweet)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
    const user = await db.get(getUserIdQuery)

    const followerIdQuery = `
      SELECT following_user_id FROM 
      follower WHERE follower_user_id = '${user.user_id}'
    `
    const followerIds = await db.all(followerIdQuery)

    const followingsArray = followerIds.map(
      follower => follower.following_user_id,
    )
    if (followingsArray.length === 0) {
      return response.status(200).send([])
    }

    const getTweetDetailQuery = `
    SELECT user_id FROM tweet 
    WHERE tweet_id = '${tweetId}'`
    const tweet = await db.get(getTweetDetailQuery)
    const {user_id} = tweet

    console.log(followingsArray.includes(user_id))

    if (!followingsArray.includes(user_id)) {
      return response.status(401).send('Invalid Request')
    } else {
      const getTweetLikesQuery = `
        select user.username 
        from user inner join like on
        user.user_id = like.user_id
        WHERE like.tweet_id = '${tweetId}'`
      const likes = await db.all(getTweetLikesQuery)
      const nameArr = likes.map(obj => obj.username)
      response.send({likes: nameArr})
    }
  },
)
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const getUserIdQuery = `
    SELECT user_id FROM user 
    WHERE username = '${username}'`
    const user = await db.get(getUserIdQuery)

    const followerIdQuery = `
      SELECT following_user_id FROM 
      follower WHERE follower_user_id = '${user.user_id}'
    `
    const followerIds = await db.all(followerIdQuery)

    const followingsArray = followerIds.map(
      follower => follower.following_user_id,
    )
    if (followingsArray.length === 0) {
      return response.status(200).send([])
    }

    const getTweetDetailQuery = `
    SELECT user_id FROM tweet 
    WHERE tweet_id = '${tweetId}'`
    const tweet = await db.get(getTweetDetailQuery)
    const {user_id} = tweet

    console.log(followingsArray.includes(user_id))

    if (!followingsArray.includes(user_id)) {
      return response.status(401).send('Invalid Request')
    } else {
      const getTweetLikesQuery = `
        select name, reply
        from user inner join reply on
        user.user_id = reply.user_id
        WHERE reply.tweet_id = '${tweetId}'`
      const replies = await db.all(getTweetLikesQuery)
      // const nameArr = likes.map(obj => obj.username)
      response.send({replies: replies})
    }
  },
)

app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)

  console.log(user)
  const getTweetsQuery = `
    SELECT tweet,
      (select count() from reply where reply.tweet_id = tweet.tweet_id) as replies,
      (select count() from like where like.tweet_id = tweet.tweet_id) as likes,
      date_time as dateTime
    FROM tweet
    WHERE user_id = '${user.user_id}'`
  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username = '${username}'`
  const user = await db.get(getUserIdQuery)
  const currentDateTime = format(new Date(), 'yyyy-MM-dd hh:mm:ss')
  console.log(user)
  const postTweetQuery = `
    insert into tweet (tweet, user_id, date_time)
    values ('${tweet}', ${user.user_id}, '${currentDateTime}')
    `
  await db.run(postTweetQuery)
  response.send('Created a Tweet')
})

app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    let {tweetId} = request.params
    tweetId = Number(tweetId)
    const getUserIdQuery = `
    SELECT user_id FROM user
    WHERE username = '${username}'`
    const user = await db.get(getUserIdQuery)

    const getTweetIds = `
      select tweet_id from tweet
      where user_id = '${user.user_id}'
    `
    const tweetIds = await db.all(getTweetIds)
    const tweetIdsArray = tweetIds.map(obj => obj.tweet_id)

    if (tweetIdsArray.includes(tweetId)) {
      const deleteTweetQuery = `
        delete from tweet
        where tweet_id = '${tweetId}'
      `
      await db.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      return response.status(401).send('Invalid Request')
    }
  },
)

module.exports = app
