from groq import Groq

client = Groq(api_key="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")

memory = []  # this stores chat history
while True:
    user_input = input("You: ")

    if user_input == "quit":
        break

    # 1. add user message to memory
    memory.append({"role": "user", "content": user_input})

    # 2. send full memory to Groq
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=memory
    )

    ai_reply = response.choices[0].message.content

    # 3. print reply
    print("AI:", ai_reply)

    # 4. store AI response too
    memory.append({"role": "assistant", "content": ai_reply})