from groq import Groq


client = Groq(api_key="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")


def function():
    response = client.chat.completions.create(
    messages=[{"role": "user", "content":one}],
    model="llama-3.3-70b-versatile"

    )

    print(response.choices[0].message.content)


one=input(":")
function()