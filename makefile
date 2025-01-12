curl "https://modern-baboon-27609.upstash.io/scan/0" \
  -H "Authorization: Bearer AWvZAAIjcDE3ZjlkZTlkZDZhYWY0ZmVhYTRlNzJhYzEyOTdjMDBiZHAxMA"


curl -X POST "https://modern-baboon-27609.upstash.io/pipeline" \
-H "Authorization: Bearer AWvZAAIjcDE3ZjlkZTlkZDZhYWY0ZmVhYTRlNzJhYzEyOTdjMDBiZHAxMA" \
-H "Content-Type: application/json" \
-d '[["scan", "0", "COUNT", "1000"], ["hgetall", "*"]]'