from groq import  Groq
x=0

knowntopics = []
while True:

 ask=input(" Add new topics : ")
 if ask in knowntopics:
     print("already added")
 else:
  knowntopics.append(ask)
  print(knowntopics)
  if ask =="/q":
      break



while x < len(knowntopics)-1:
 print(knowntopics[x])
 x=x+1
