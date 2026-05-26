

from groq import Groq



client = Groq(api_key = "")

history= []
def called():
     response=client.chat.completions.create(
     messages=[{"role":"user", "content":give}],
     history.append("role":"user", "content":give)
    model="llama-3.3-70b-versatile",

    )

     answer = response.choices[0].message.content
     print("ai : ", answer)

print("AI CONVO")
while True:

 give = input("you : ")
 if give == "/q":
     break
 else:
  called()




